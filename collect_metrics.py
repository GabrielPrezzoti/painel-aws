"""Publish EC2 metrics in the format consumed by the dashboard."""

import argparse
import json
import math
import os
from pathlib import Path
import subprocess
import tempfile
from datetime import datetime, timedelta, timezone


PERIOD_SECONDS = 300
MIB = 1024 ** 2
METRICS = {
    "cpu": ("cpu", "CPUUtilization", "Average", 1),
    "network_in": ("networkIn", "NetworkIn", "Sum", MIB),
    "network_out": ("networkOut", "NetworkOut", "Sum", MIB),
    "memory": ("memory", "CWAgent", "mem_used_percent", "Average", 1),
    "disk": ("disk", "CWAgent", "disk_used_percent", "Average", 1),
}


def utc_timestamp(date):
    return date.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def build_request(instance_id, end):
    return {
        "StartTime": utc_timestamp(end - timedelta(hours=24)),
        "EndTime": utc_timestamp(end),
        "ScanBy": "TimestampAscending",
        "MetricDataQueries": [
            {
                "Id": query_id,
                "MetricStat": {
                    "Metric": {
                        "Namespace": namespace,
                        "MetricName": name,
                        "Dimensions": [{"Name": "InstanceId", "Value": instance_id}],
                    },
                    "Period": PERIOD_SECONDS,
                    "Stat": statistic,
                },
            }
            for query_id, (_, namespace, name, statistic, _) in METRICS.items()
        ],
    }


def read_cloudwatch(request, region, profile):
    command = [
        "aws", "cloudwatch", "get-metric-data", "--region", region,
        "--cli-input-json", json.dumps(request), "--output", "json", "--no-cli-pager",
    ]
    if profile:
        command.extend(["--profile", profile])
    result = subprocess.run(
        command, check=True, capture_output=True, encoding="utf-8", timeout=90,
    )
    return json.loads(result.stdout)


def make_snapshot(response, end):
    series = {key: [] for key in ("cpu", "memory", "disk", "networkIn", "networkOut")}
    results = {item["Id"]: item for item in response["MetricDataResults"]}
    for query_id, (key, _, _, divisor) in METRICS.items():
        result = results.get(query_id)
        if not result or result.get("StatusCode") != "Complete":
            status = result.get("StatusCode") if result else "ausente"
            raise ValueError(f"Resultado incompleto para {query_id}: {status}.")
        for timestamp, value in zip(result["Timestamps"], result["Values"], strict=True):
            if not math.isfinite(value) or value < 0:
                raise ValueError(f"Valor inválido para {query_id}.")
            date = datetime.fromisoformat(timestamp)
            if date.tzinfo is None:
                raise ValueError(f"Horário sem fuso para {query_id}.")
            series[key].append({"timestamp": utc_timestamp(date), "value": value / divisor})

    if not any(series.values()):
        raise ValueError("Nenhuma amostra. Confira o ID, a região e a atividade da instância.")
    return {
        "source": "cloudwatch",
        "updatedAt": utc_timestamp(end),
        "periodSeconds": PERIOD_SECONDS,
        "metrics": series,
    }


def publish_snapshot(snapshot, destination):
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="utf-8", dir=destination.parent, delete=False,
    ) as temporary:
        pending = Path(temporary.name)
        try:
            json.dump(snapshot, temporary, allow_nan=False, separators=(",", ":"))
            temporary.write("\n")
            temporary.close()
            pending.chmod(0o644)
            pending.replace(destination)
        finally:
            pending.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description="Exporta métricas EC2 do CloudWatch.")
    parser.add_argument("--instance-id", required=True, help="ID da instância EC2")
    parser.add_argument("--region", default="sa-east-1", help="Região AWS da instância")
    parser.add_argument("--profile", help="Perfil opcional da AWS CLI")
    parser.add_argument(
        "--output", type=Path, default=Path(__file__).with_name("metrics.json"),
        help="Caminho do arquivo JSON a publicar",
    )
    args = parser.parse_args()
    now = datetime.now(timezone.utc)
    end = datetime.fromtimestamp(int(now.timestamp()) // PERIOD_SECONDS * PERIOD_SECONDS, timezone.utc)
    try:
        response = read_cloudwatch(build_request(args.instance_id, end), args.region, args.profile)
        snapshot = make_snapshot(response, end)
        publish_snapshot(snapshot, args.output)
    except subprocess.CalledProcessError as error:
        parser.exit(1, f"Falha na AWS CLI: {error.stderr.strip()}\n")
    except (OSError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired) as error:
        parser.exit(1, f"Falha na coleta: {error}\n")
    counts = ", ".join(
        f"{key}={len(snapshot['metrics'][key])}" for key, *_ in METRICS.values()
    )
    print(f"{args.output}: {counts}")


if __name__ == "__main__":
    main()
