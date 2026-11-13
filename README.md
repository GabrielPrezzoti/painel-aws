# Painel AWS

Painel estático do estudo de caso do TCC, feito em HTML, CSS e JavaScript. Exibe CPU, memória, ocupação do disco e tráfego de rede em janelas de 1, 6 e 24 horas.

## Executar localmente

Node.js com npm. 
cd painel-aws
npx.cmd --yes http-server . -a 127.0.0.1 -p 8080 -c-1
```

 [http://127.0.0.1:8000](http://127.0.0.1:8000).

## Dados do CloudWatch

O coletor requer Python 3.11 ou superior e AWS CLI v2. Execute a partir da pasta do projeto, substituindo o ID abaixo pelo da sua EC2. A região padrão é São Paulo (`sa-east-1`).

```sh
python collect_metrics.py --instance-id i-0123456789abcdef0
```

No Ubuntu, use `python3`. Na EC2, associe à instância uma função IAM com permissão `cloudwatch:GetMetricData`. No computador local, use um perfil autenticado com a mesma permissão e passe `--profile nome-do-perfil`, se necessário. Use `--region` se a instância estiver em outra região.

Cada execução consulta as últimas 24 horas, com médias de CPU e somas de tráfego de rede em períodos de 5 minutos. O coletor converte bytes em MiB e gera `metrics.json` ao lado de `index.html`. Use `--output` para definir outro destino se o Nginx servir os arquivos de outra pasta. Em caso de falha na consulta, o último arquivo válido é preservado.

Depois de rodar o coletor, abra o site ou clique em **Atualizar dados**. A origem deve mudar para **Amazon CloudWatch**. Compare uma amostra de CPU com o console do CloudWatch usando a mesma instância, o mesmo intervalo de cinco minutos e a estatística `Average`. Para tráfego, compare com `Sum` e divida os bytes por 1.048.576. Memória e disco aparecem sem amostras até a integração com o CloudWatch Agent.

O coletor executa uma vez por comando. O agendamento na EC2 será configurado após a primeira validação com dados reais. O Nginx deve devolver HTTP 404 quando `metrics.json` estiver ausente.

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
