from app.features.intent_detection import detect_intent

mensagens = [
    "Marque uma reunião com João amanhã às 14h",
    "Olá, tudo bem?",
    "Quero agendar uma consulta médica sexta-feira às 10h",
    "Quais compromissos tenho amanhã?",
    "Marque uma reunião com Ana"
]

for mensagem in mensagens:
    print("\nMensagem:", mensagem)

    try:
        resultado = detect_intent(mensagem)
        print("Resultado:", resultado)
    except Exception as erro:
        print("Erro:", erro)