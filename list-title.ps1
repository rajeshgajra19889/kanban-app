$f = 'D:\Rajesh\Angular\kanban-app\src\app\board\board.html'
$l = [IO.File]::ReadAllLines($f)
for ($n = 0; $n -lt $l.Count; $n++) {
  if ($l[$n] -match 'class="list-header"') {
    "{0}: {1}" -f ($n + 1), $l[$n].Trim()
  }
}
