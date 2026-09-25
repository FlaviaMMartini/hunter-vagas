' Roda buscar-vagas.cmd sem abrir janela preta (chamado pelo Agendador de Tarefas a cada 1h).
Set fso = CreateObject("Scripting.FileSystemObject")
pasta = fso.GetParentFolderName(WScript.ScriptFullName)
CreateObject("WScript.Shell").Run """" & pasta & "\buscar-vagas.cmd""", 0, True
