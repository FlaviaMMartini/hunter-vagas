' Roda painel.cmd sem abrir janela preta (chamado pelo Agendador de Tarefas ao entrar no Windows).
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run """" & pasta & "\painel.cmd""", 0, False
