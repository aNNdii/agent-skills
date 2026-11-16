#!/usr/bin/env bash
# Verify command for pi/. Keeps the worktree rules in pi/references/worktrees.md,
# the README diagram in sync with pi/flow.mmd, the fork boundaries (only pi/ changes), and runs
# the tests in pi/scripts/ (among them the drift check of the tiers block in pi/workflows/*.js).
# Usage: bash pi/scripts/check-references.sh <base>
set -uo pipefail

base=${1:?usage: check-references.sh <base>}
cd "$(dirname "$0")/../.." || exit 1
ref=pi/references/worktrees.md
fail=0
err() { echo "check-references: $*" >&2; fail=1; }

# a) The mermaid block in pi/README.md equals pi/flow.mmd.
if ! diff -q <(sed -n '/^```mermaid$/,/^```$/p' pi/README.md | sed '1d;$d') pi/flow.mmd >/dev/null; then
  err "a) the mermaid block in pi/README.md differs from pi/flow.mmd"
fi

# b) Every link to a section of a file in pi/references/ matches a heading there.
#    Anchor = heading in lowercase, punctuation dropped, spaces as hyphens.
while IFS= read -r hit; do
  file=${hit%%:*} link=${hit#*:}
  target=pi/references/${link%%#*}
  [ -f "$target" ] || continue
  anchors=$(sed -n 's/^#\{1,6\} \(.*\)$/\1/p' "$target" | tr 'A-Z' 'a-z' | sed 's/[^a-z0-9 -]//g; s/ /-/g')
  grep -qxF -- "${link#*#}" <<<"$anchors" || err "b) $file links $link, but $target has no such heading"
done < <(grep -rIoE '[a-z-]+[.]md#[a-z0-9-]+' pi)

# c) A skill that links the reference must not restate its rules.
tokens=('info/exclude' 'stash push' 'stash pop' 'check-ref-format' 'worktree add' 'symbolic-ref'
        '-worktrees/' 'feat/<topic>' 'else the current branch')
while IFS= read -r file; do
  for t in "${tokens[@]}"; do
    if grep -qF -- "$t" "$file"; then err "c) $file restates a worktree rule ('$t'), link $ref instead"; fi
  done
done < <(grep -rlF 'references/worktrees.md' pi/skills)

# d) Every phase prompt's default searches <main>/.specs/ first.
for p in flow plan build review; do
  grep -qF -- '<main>/.specs/' "pi/prompts/$p.md" || err "d) pi/prompts/$p.md does not name <main>/.specs/ in its default"
done

# e) Fork boundaries: nothing changed outside pi/ since the branch left <base> (tracked or new
#    untracked files), no terminal-multiplexer hook. Diff against the merge-base, so new commits
#    on <base> do not turn this red. package.json may change only in its "pi" manifest block.
mb=$(git merge-base "$base" HEAD) || { err "e) no merge-base with $base"; mb=$base; }
outside=$( { git diff --name-only "$mb" -- . ':!pi'; git ls-files --others --exclude-standard -- . ':!pi'; } | sort -u)
if grep -qx 'package.json' <<<"$outside"; then
  # Compare both sides without their "pi" block. Any failure (no node, broken JSON) keeps package.json listed.
  strip='const j=JSON.parse(require("fs").readFileSync(0,"utf8"));delete j.pi;process.stdout.write(JSON.stringify(j))'
  if old=$(git show "$mb:package.json" | node -e "$strip") && new=$(node -e "$strip" <package.json) &&
     [ -n "$old" ] && [ "$old" = "$new" ]; then
    outside=$(grep -vx 'package.json' <<<"$outside")
  fi
fi
[ -z "$outside" ] || err "e) files outside pi/ changed since $base: $(echo $outside)"
# The bracket keeps this line from matching itself.
if grep -rIqi 'herd[r]' pi; then err "e) pi/ mentions herd""r"; fi

# f) The tests in pi/scripts/ pass. They live inside pi/, so nothing outside pi/ runs them.
node --test --test-reporter=dot pi/scripts/*-test.js >/dev/null || err "f) tests in pi/scripts/ fail, run: node --test pi/scripts/*-test.js"

[ "$fail" -eq 0 ] && echo "check-references: ok"
exit "$fail"
