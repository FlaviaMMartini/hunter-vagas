// Notificação nativa do Windows (canto da tela), sem dependências.
// Clicar na notificação abre `url` no navegador.
import { execFile } from 'node:child_process';

const xml = (s) => String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));

export function notify(title, message, url) {
  const toast = `<toast activationType="protocol" launch="${xml(url)}" scenario="reminder">`
    + `<visual><binding template="ToastGeneric"><text>${xml(title)}</text><text>${xml(message)}</text></binding></visual>`
    + `<actions><action content="Abrir no Gmail" activationType="protocol" arguments="${xml(url)}"/>`
    + '<action content="Fechar" activationType="system" arguments="dismiss"/></actions></toast>';
  // O XML vai em base64 para não brigar com aspas do PowerShell.
  const script = `
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null
    $doc = New-Object Windows.Data.Xml.Dom.XmlDocument
    $doc.LoadXml([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(toast, 'utf8').toString('base64')}')))
    $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe'
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show([Windows.UI.Notifications.ToastNotification]::new($doc))`;
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true }, (err) => resolve(!err));
  });
}
