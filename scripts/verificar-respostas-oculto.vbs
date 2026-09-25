' Roda verificar-respostas.cmd sem abrir janela preta (chamado pelo Agendador de Tarefas a cada 10 min).
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run """" & pasta & "\verificar-respostas.cmd""", 0, True
