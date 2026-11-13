# Painel AWS

Painel estático do estudo de caso do TCC, feito em HTML, CSS e JavaScript. Exibe CPU, memória, ocupação do disco e tráfego de rede em janelas de 1, 6 e 24 horas.

## Executar localmente

Na pasta do projeto, com Python instalado:

```sh
python -m http.server 8000 --bind 127.0.0.1
```

Abra http://127.0.0.1:8000. Quando o arquivo de métricas ainda não existe (HTTP 404), a página identifica os dados como simulados.

## Dados do CloudWatch

A futura rotina de coleta deve publicar `metrics.json` ao lado de `index.html`, com as séries em intervalos regulares. O Nginx deve devolver HTTP 404 quando o arquivo estiver ausente. As credenciais AWS pertencem ao coletor.

```json
{
  "source": "cloudwatch",
  "updatedAt": "2026-11-13T15:00:00Z",
  "periodSeconds": 300,
  "metrics": {
    "cpu": [{ "timestamp": "2026-11-13T14:55:00Z", "value": 21.4 }],
    "memory": [],
    "disk": [],
    "networkIn": [],
    "networkOut": []
  }
}
```

Use UTC nos horários, porcentagem para CPU, memória e disco, e MiB por intervalo para tráfego. O campo `updatedAt` é o fim da janela coletada. As séries sem amostras aparecem como indisponíveis. A interface exibe horários no fuso do navegador.
