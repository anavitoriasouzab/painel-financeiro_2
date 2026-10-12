# Checklist — correções e melhorias

Lista viva: itens entram conforme forem aparecendo no uso, e a ordem de
prioridade é revisada a cada item novo. Marcar `[x]` quando passar pela
"Definição de pronto" do CLAUDE.md.

Prioridade: **P1** quebra o uso / dado errado · **P2** atrapalha bastante ·
**P3** melhoria / polimento

---

## P1

### [ ] Relatório em PDF quebrado no mobile (principalmente no app instalado)
Relato: no celular, sobretudo no app instalado (PWA), o PDF sai quebrado e
com cores estranhas. A pré-visualização também quebra, e o PDF abre só com
uma tela preta.

**Status: corrigido em 07/10/2026, falta testar num celular de verdade**
(testado em Chrome emulando celular, tablet e desktop, com e sem dados).
Para fechar o item: no app instalado, abrir Perfil → Exportar relatório
mensal → Gerar PDF → salvar ou mandar pelo WhatsApp e abrir o arquivo.

Causas encontradas no código (`js/report.js` + `@media print` em `css/style.css`):
- **PDF preto e vazio:** a impressão escondia o app com `visibility:hidden`,
  que continua ocupando espaço, e o fundo escuro do tema saía impresso.
- **Cores dos gráficos erradas no tema escuro (padrão do app):** a folha é
  sempre clara, mas `SimpleCharts.palette()` olha o tema do `<html>` e entrega
  a paleta *escura* (tons pastel) para "Onde o dinheiro foi". Isso acontece
  na tela e no PDF.
- **Fundos somem na impressão:** falta `print-color-adjust: exact`, então o
  navegador descarta o lilás dos cards, do bloco do gráfico, do total da
  tabela e dos quadros de insights. No Chrome Android nem existe a opção
  "gráficos de fundo" para religar.
- **"PDF" é só `window.print()`:** no app instalado (iOS, principalmente) a
  janela de impressão é instável ou nem abre, e não sai um arquivo para
  salvar ou compartilhar.
- **Tabelas largas no celular (provável, falta confirmar):** "Compras do mês"
  tem 5 colunas e nenhuma rolagem horizontal, então em ~360px estoura a folha.

Caminho proposto: corrigir a paleta e o CSS de impressão primeiro (barato).
No mobile, gerar um arquivo PDF de verdade e abrir o "Compartilhar" do
sistema (salvar no arquivo, mandar pelo WhatsApp etc.). No desktop, manter
a impressão.

Falta saber: iPhone ou Android? Quebra na pré-visualização dentro do app,
no PDF gerado, ou nos dois?

### [x] Login ilegível no tema claro (audit 07/10/2026)
**Feito em 07/10/2026:** o login agora é sempre escuro (`login.html`).

Quem usa o app no tema claro e sai da conta vê o login com o cartão cinza
translúcido em cima do fundo, que é SEMPRE escuro (`js/shader-background.js:380`).
"E-mail", "Senha", o subtítulo e "Esqueci minha senha" ficam com contraste
de 1:1 a 2:1, praticamente invisíveis. Os estilos claros do `css/auth.css`
foram feitos para fundo claro. Saída mais simples: o login ser sempre
escuro, como o fundo já é (ignorar `financas_theme` no `login.html`).

## P2

### [x] Cinza de texto secundário abaixo do contraste mínimo (audit 07/10/2026)
**Feito em 07/10/2026:** `--text-muted` escuro #81889D (4,6:1) e claro
`#6A627E` (4,7:1). O secundário claro desceu para #58526D, para não ficar igual
ao muted, e o `--danger` claro para #B9362A (4,8:1).

`--text-muted` no tema escuro (padrão do app) dá 3,72:1 sobre os cards e
3,40:1 sobre `--surface-soft`. O mínimo é 4,5:1. No claro dá 3,84:1 sobre
`--surface-soft`. O token é usado em 39 lugares, vários com letra de 9,5 a
11px (legendas de gráfico, datas, "Ainda sem histórico suficiente"). Ajustar
o TOKEN, não cada lugar: clarear `--text-muted` do escuro até ≥4,5:1 sobre
`--surface-soft` e refazer a conta no claro.

### [x] Estrutura para leitor de tela (audit 07/10/2026)
**Feito em 07/10/2026:** 19 títulos de seção viraram `<h2>`, 15 títulos de
card viraram `<h3>`, o Dashboard ganhou um `<h2>` só para leitor de tela e os
seletores de mês ganharam `<label for>`.

- Nenhuma tela tem `<h1>`/`<h2>`: os títulos ("Resumo do mês", "Renda",
  "Minhas metas") são texto comum. Quem usa leitor de tela não consegue pular
  entre seções
- Os dois seletores de mês da comparação em Análises
  (`#compare-month-a`/`#compare-month-b`) não têm rótulo

### [x] Contrastes que sobraram em gráficos (audit 12/10/2026)
**Feito em 12/10/2026:** cada nível do calendário ganhou o seu tom de texto;
o rótulo do gráfico de linha escurece em fundo claro e clareia em fundo
escuro, decidindo pelo `data-theme` mais próximo
(`SimpleCharts._isDarkAt`), não pelo do `<html>`, o que corrige também o PDF;
`--danger` escuro foi para #F98181 (4,9:1 no selo). A varredura das 5 telas,
nos 2 temas, no celular e no desktop, deu zero falhas de contraste.

Achados na varredura de contraste real, tela por tela, nos dois temas:
- **Calendário de gastos (Análises):** o número do dia, com 9,5px, usa
  `--text-muted` sobre as células mais cheias de roxo, dando de 2,6:1 a 4,3:1.
  O tema escuro já tem regra própria para os níveis 3 e 4
  (`.sc-heatmap-cell-day` em `css/style.css`), o claro não tem, e a do
  escuro ainda não cobre o nível 1
- **Rótulos "7,2k"/"4,1k" do gráfico de linha (tema claro):** o SimpleCharts
  CLAREIA a cor da série em 40% para escrever o valor
  (`js/simplecharts.js:648`, `_shade(cor, 0.4)`), o que dá 2,6:1 e 3,2:1 com
  10px. No claro o certo é escurecer. O mesmo rótulo aparece no PDF do
  relatório
- **Selo "Vencido" no tema escuro:** 4,41:1, por pouco abaixo de 4,5:1

### [x] Lançar gasto por voz: destaque no Dashboard + correções (12/10/2026)
**Feito:** barra "Fale um gasto" no topo do Dashboard (celular) e ícone no
cabeçalho (desktop). Corrigido: "1.250" lido como 1,25; "99" casando dentro
de "199"; "2 mil e 300" virando 2; nome falado trocado pelo da categoria;
Esc que escondia o popup com o mic ainda ouvindo; silêncio sem aviso;
`alert()` nativo; categoria chutada sem aviso (agora fica em branco e o
salvar exige escolher). **Falta testar no celular de verdade**, sobretudo no
iPhone com o app instalado, onde o reconhecimento de voz do Safari pode não
funcionar fora do navegador.

### [ ] Voz: entender "ontem"/"hoje" e números por extenso
"gastei 50 ontem" ainda grava com a data em branco (cai no mês de
referência). "quarenta reais" por extenso não vira 40; o Chrome costuma
mandar em algarismo, mas nem sempre.

## P3

### [ ] Toques e animações mais leves no celular (audit 07/10/2026)
**Parte feita em 07/10/2026:** alvos de toque com 44px em tela de toque
(`@media (pointer: coarse)`) e o buraco nos cards do Dashboard. **Falta:**
animação de largura nas barras e os travessões nos textos.
- Botões de editar/excluir dos cards (Contas, Renda) têm 28×28px. Passam no
  mínimo do WCAG (24px), mas ficam abaixo dos 44px recomendados para dedo.
  Os ícones do topo (tema, sino, avatar) têm 40×40px
- No Dashboard, os 3 cards do topo deixam um buraco à direita (no celular,
  "Disponível" fica sozinho na 2ª linha; no desktop sobra uma coluna)
- Barras de gráfico animam `width`/`height` (`.sc-ranked-fill`,
  `.sc-flow-seg`, barras de progresso). É uma animação só de entrada, baixo
  impacto, mas trocar por `transform: scaleX()` deixa mais suave
- Textos da interface com 31 travessões (—), cansando a leitura
- (audit 12/10) No celular, as células do calendário de gastos são
  tocáveis com 37px e o "Ver mais →" das transações tem 24px de altura

Falsos positivos do detector, conferidos (não mexer): `<img>` sem `src`
(todas ficam escondidas até o JS preencher), "espaçamento apertado" nos
círculos de ícone e avatar, "maiúsculas em texto longo" (são rótulos curtos
de card) e "aba lateral" (borda dos quadros de insights do relatório).

## Futuro (projetos maiores — planejar antes de começar)

### [ ] Bot no WhatsApp ou Telegram para lançar gasto por mensagem
Mandar algo como "gastei 45 no mercado no débito" e a despesa cair no app.

### [ ] Foto do comprovante/recibo → despesa preenchida automaticamente
Tirar foto do cupom/recibo (no bot ou no próprio app) e ele identificar
valor, data, estabelecimento e sugerir categoria.

Notas para quando formos planejar os dois:
- Precisa de um backend, coisa que o app hoje não tem (é só front-end +
  Supabase). Caminho natural: uma Supabase Edge Function recebendo o webhook
  do bot. É a primeira exceção à regra "tudo passa por `Storage`", porque a
  gravação acontece no servidor. Ela precisa gravar no mesmo formato que o
  `Storage` grava, para o app ler normalmente.
- Vincular a conta do chat ao usuário do app (ex.: código de pareamento
  gerado no Perfil), para o bot saber em nome de quem está lançando — e só
  aceitar mensagens de chats vinculados.
- Telegram é bem mais simples de começar (bot gratuito, sem aprovação).
  WhatsApp exige a API oficial da Meta (conta business verificada, número
  dedicado, custo por conversa).
- Entender o texto e ler a foto do recibo: modelo de IA com visão (ex.:
  Claude) chamado pela Edge Function, devolvendo valor/data/estabelecimento/
  categoria. A chave da API fica só no servidor, nunca no front-end.
- Já existe `js/voice-expense.js` (lançar despesa por voz) — ver o que dá
  para reaproveitar da interpretação do texto.
- Confirmar antes de gravar: o bot responde "Mercado · R$ 45,00 · Alimentação
  · hoje — confirma?" para evitar lançamento errado.
