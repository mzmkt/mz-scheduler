# MZ Scheduler

Servidor intermediário que recebe posts aprovados do Kanban MZ e agenda no Buffer.

## Deploy no Railway

1. Suba esta pasta para um repositório GitHub
2. No Railway: New Project → Deploy from GitHub → seleciona o repositório
3. Vá em **Variables** e adicione:
   - `BUFFER_TOKEN` = `kWT16nyLpo7ETOJYioFKpKoW9lvW-w6_6gTeIIFHDl7`
4. Railway gera uma URL tipo `mz-scheduler-production.up.railway.app`
5. Copie essa URL e atualize o HTML (variável `SCHEDULER_URL`)

## Endpoint

`POST /schedule` — recebe payload do HTML e agenda no Buffer

## Teste rápido

Acesse a URL raiz no browser — deve aparecer `{"status":"MZ Scheduler online ✅"}`
