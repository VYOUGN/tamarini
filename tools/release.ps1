# What ارفع.bat runs: checks the code, asks what changed, commits, bumps VERSION in docs/sw.js, pushes, and waits for the site.
# -Message and -NoDialogs skip the windows, for testing.
param([string]$Message, [switch]$NoDialogs)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [Text.Encoding]::UTF8
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

function Say([string]$text, [switch]$Bad) {
  if ($NoDialogs) { Write-Host $text; return }
  $icon = if ($Bad) { 'Warning' } else { 'Information' }
  $rtl = [Windows.Forms.MessageBoxOptions]::RtlReading -bor [Windows.Forms.MessageBoxOptions]::RightAlign
  [void][Windows.Forms.MessageBox]::Show($text, 'تماريني', 'OK', $icon, 'Button1', $rtl)
}
function Stop-With([string]$text) { Say $text -Bad; exit 1 }

# Runs a program and returns its exit code and output, without PowerShell turning stderr into errors.
function Run([string]$exe, [string[]]$argv) {
  $psi = New-Object Diagnostics.ProcessStartInfo $exe
  $psi.Arguments = ($argv | ForEach-Object { if ($_ -match '[\s"]') { '"' + ($_ -replace '"', '\"') + '"' } else { $_ } }) -join ' '
  $psi.WorkingDirectory = $root
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.StandardOutputEncoding = [Text.Encoding]::UTF8
  $psi.StandardErrorEncoding = [Text.Encoding]::UTF8
  $p = [Diagnostics.Process]::Start($psi)
  $out = $p.StandardOutput.ReadToEndAsync()
  $err = $p.StandardError.ReadToEnd()
  $p.WaitForExit()
  [pscustomobject]@{ Code = $p.ExitCode; Out = $out.Result.TrimEnd(); Err = $err.Trim() }
}
function Git { Run $script:gitExe (@('-c', 'core.quotepath=false') + $args) }
function Need($r, [string]$why) { if ($r.Code) { Stop-With "$why`n`n$($r.Err) $($r.Out)".Trim() } }
$lines = { param($s) @($s -split "`r?`n" | Where-Object { $_ }) }

# The window that lists the changed files and asks for a line about them. ShowDialog() returns OK or Cancel; .Tag is the text box.
function New-AskForm([string[]]$files) {
  $pad = { param($t, $b) New-Object Windows.Forms.Padding(0, $t, 0, $b) }
  $f = New-Object Windows.Forms.Form -Property @{
    Text = 'ارفع على GitHub'; RightToLeft = 'Yes'; RightToLeftLayout = $true; StartPosition = 'CenterScreen'; TopMost = $true
    FormBorderStyle = 'FixedDialog'; MaximizeBox = $false; MinimizeBox = $false; AutoSize = $true; AutoSizeMode = 'GrowAndShrink'
    Padding = New-Object Windows.Forms.Padding(16); Font = New-Object Drawing.Font('Segoe UI', 11)
  }
  $flow = New-Object Windows.Forms.FlowLayoutPanel -Property @{ FlowDirection = 'TopDown'; WrapContents = $false; AutoSize = $true }
  $flow.Controls.Add((New-Object Windows.Forms.Label -Property @{ Text = 'الملفات اللي تغيّرت:'; AutoSize = $true; Margin = (& $pad 0 4) }))
  $flow.Controls.Add((New-Object Windows.Forms.TextBox -Property @{
    Multiline = $true; ReadOnly = $true; RightToLeft = 'No'; ScrollBars = 'Vertical'; Width = 400
    Height = [Math]::Min(6, $files.Count) * 22 + 10; Text = ($files -join "`r`n")
  }))
  $flow.Controls.Add((New-Object Windows.Forms.Label -Property @{ Text = 'وش عدّلت؟ يطلع في سجل GitHub:'; AutoSize = $true; Margin = (& $pad 14 4) }))
  $box = New-Object Windows.Forms.TextBox -Property @{ Text = 'تحديث'; Width = 400 }
  $flow.Controls.Add($box)
  $row = New-Object Windows.Forms.FlowLayoutPanel -Property @{ AutoSize = $true; Margin = (& $pad 16 0) }
  $ok = New-Object Windows.Forms.Button -Property @{ Text = 'ارفع'; DialogResult = 'OK'; AutoSize = $true; Padding = New-Object Windows.Forms.Padding(12, 2, 12, 2) }
  $cancel = New-Object Windows.Forms.Button -Property @{ Text = 'إلغاء'; DialogResult = 'Cancel'; AutoSize = $true; Padding = New-Object Windows.Forms.Padding(12, 2, 12, 2) }
  $row.Controls.AddRange(@($ok, $cancel))
  $flow.Controls.Add($row)
  $f.Controls.Add($flow)
  $f.AcceptButton = $ok
  $f.CancelButton = $cancel
  $f.Tag = $box
  $f.Add_Shown({ $this.Activate(); $this.Tag.Focus(); $this.Tag.SelectAll() })
  $f
}

try {
  $script:gitExe = (Get-Command git.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source
  if (-not $script:gitExe) { Stop-With 'git مو مثبّت على هذا الجهاز.' }

  Write-Host 'Looking for changes...'
  $changed = & $lines (Git status --porcelain).Out | ForEach-Object { $_.Substring(3).Trim('"') }
  $ahead = [int](Git rev-list --count '@{u}..HEAD').Out
  if (-not $changed.Count -and -not $ahead) { Say 'ما فيه تعديل جديد ترفعه. إذا عدّلت شي، احفظه أول بـ Ctrl+S وجرّب مرة ثانية.'; exit 0 }

  # A missing quote or comma would leave everyone with a blank app, so a file that doesn't parse stops here.
  $node = (Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1).Source
  if ($node) {
    foreach ($js in 'docs/app.js', 'docs/sw.js') {
      $r = Run $node @('--check', $js)
      # node's first four lines: file:line, the line itself, a marker under the mistake, and what's wrong.
      $why = (& $lines ($r.Err -replace [regex]::Escape("$root\"), '') | Select-Object -First 4) -join "`n"
      if ($r.Code) { Stop-With "فيه خطأ كتابة في $js، فما رفعت شي:`n`n$why`n`nصلّحه واحفظ، وبعدين جرّب مرة ثانية." }
    }
  }

  if ($changed.Count) {
    if (-not $Message) {
      $form = New-AskForm $changed
      if ($form.ShowDialog() -ne 'OK') { exit 0 }
      $Message = $form.Tag.Text.Trim()
    }
    if (-not $Message) { $Message = 'تحديث' }
    $msgFile = [IO.Path]::GetTempFileName()
    [IO.File]::WriteAllText($msgFile, $Message, (New-Object Text.UTF8Encoding $false))
    Need (Git add -A) 'ما قدرت أجهّز الملفات للرفع.'
    $r = Git commit -q -F $msgFile
    Remove-Item $msgFile
    Need $r 'ما قدرت أحفظ التعديل في git.'
  }

  $kept = 'تعديلك محفوظ على جهازك، وبيترفع لما تضغط «ارفع» مرة ثانية.'
  Write-Host 'Getting the latest from GitHub...'
  Need (Git fetch -q origin) "ما قدرت أوصل لـ GitHub. تأكد من الإنترنت.`n$kept"
  $r = Git rebase -q '@{u}'
  if ($r.Code) {
    [void](Git rebase --abort)
    Stop-With "فيه تعديل على GitHub يتعارض مع تعديلك، غالبًا لأنك عدّلت نفس السطر من موقع GitHub. ما رفعت شي، وتعديلك محفوظ على جهازك وما ضاع.`n`nقول لـ Claude يحلّها لك."
  }

  # The phones only fetch the app again when VERSION changes. A version already raised by hand is kept.
  $diff = & $lines (Git diff --name-only '@{u}' HEAD).Out
  $appChanged = @($diff | Where-Object { $_ -like 'docs/*' -and $_ -ne 'docs/Code.gs' }).Count -gt 0
  $swPath = Join-Path $root 'docs\sw.js'
  $sw = [IO.File]::ReadAllText($swPath)
  $ver = [int][regex]::Match($sw, 'tamarini-v(\d+)').Groups[1].Value
  $remoteVer = [int][regex]::Match((Git show '@{u}:docs/sw.js').Out, 'tamarini-v(\d+)').Groups[1].Value
  if ($appChanged -and $ver -le $remoteVer) {
    $ver = $remoteVer + 1
    [IO.File]::WriteAllText($swPath, ($sw -replace 'tamarini-v\d+', "tamarini-v$ver"), (New-Object Text.UTF8Encoding $false))
    Need (Git add docs/sw.js) 'ما قدرت أغيّر رقم النسخة.'
    Need (Git commit -q --amend --no-edit) 'ما قدرت أغيّر رقم النسخة.'
  }

  Write-Host 'Uploading...'
  Need (Git push -q) "ما قدرت أرفع على GitHub.`n$kept"

  $live = $false
  $m = [regex]::Match((Git remote get-url origin).Out, 'github\.com[/:]([^/]+)/([^/]+?)(\.git)?$')
  if ($appChanged -and $m.Success) {
    $site = "https://$($m.Groups[1].Value.ToLower()).github.io/$($m.Groups[2].Value)/sw.js"
    Write-Host 'Waiting for the site to update (up to 2 minutes)...'
    for ($i = 0; $i -lt 24 -and -not $live; $i++) {
      Start-Sleep 5
      try { $live = (Invoke-WebRequest "$site`?t=$(Get-Random)" -UseBasicParsing -TimeoutSec 10).Content -match "tamarini-v$ver\b" } catch {}
    }
  }

  if (-not $appChanged) { $done = "انرفع ✓`n`nما تغيّر شي في التطبيق نفسه، فما يحتاج أحد يسوي شي على جواله." }
  elseif ($live) { $done = "انرفع ✓ والنسخة صارت v$ver، وهي على الموقع الحين.`n`nعشان توصل لصاحبك: يسكّر التطبيق كامل ويفتحه." }
  else { $done = "انرفع ✓ والنسخة صارت v$ver.`n`nالموقع ياخذ دقيقة أو دقيقتين يتحدّث، وبعدها صاحبك يسكّر التطبيق كامل ويفتحه." }
  if ($diff -contains 'docs/Code.gs') { $done += "`n`nانتبه: غيّرت Code.gs، وهذا ما يوصل لحاله. كل واحد لازم يلصقه في جدوله، والخطوات في SETUP.md." }
  Say $done
} catch {
  Stop-With "صار خطأ ما توقعته، وما كمّلت:`n`n$($_.Exception.Message)"
}
