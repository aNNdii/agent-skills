#!/usr/bin/env bash
# Verify command for pi/. Keeps the worktree rules in pi/references/worktrees.md,
# the README diagram in sync with pi/flow.mmd, the fork boundaries (only pi/ changes), and runs
# the tests in pi/scripts/ (among them the drift check of the tiers block in pi/workflows/*.js).
# Usage: bash pi/scripts/check-references.sh <base> [allowed path outside pi/ ...]
#   Extra arguments are paths outside pi/ that may change, e.g. package.json for the
#   pi.extensions entry: bash pi/scripts/check-references.sh main package.json
set -uo pipefail

base=${1:?usage: check-references.sh <base> [allowed path outside pi/ ...]}
shift
excludes=(':!pi')
for allowed in "$@"; do excludes+=(":!$allowed"); done
cd "$(dirname "$0")/../.." || exit 1
ref=pi/references/worktrees.md
fail=0
err() { echo "check-references: $*" >&2; fail=1; }

# a) The mermaid block in pi/README.md equals pi/flow.mmd.
if ! diff -q <(sed -n '/^```mermaid$/,/^```$/p' pi/README.md | sed '1d;$d') pi/flow.mmd >/dev/null; then
  err "a) the mermaid block in pi/README.md differs from pi/flow.mmd"
fi

# b) Every link to a section of the reference matches a heading there.
#    Anchor = heading in lowercase, punctuation dropped, spaces as hyphens.
anchors=""
if [ -f "$ref" ]; then
  anchors=$(sed -n 's/^#\{1,6\} \(.*\)$/\1/p' "$ref" | tr 'A-Z' 'a-z' | sed 's/[^a-z0-9 -]//g; s/ /-/g')
fi
while IFS= read -r hit; do
  file=${hit%%:*} link=${hit#*:}
  grep -qxF -- "${link#*#}" <<<"$anchors" || err "b) $file links $link, but $ref has no such heading"
done < <(grep -rIoE 'worktrees[.]md#[a-z0-9-]+' pi)

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
#    on <base> do not turn this red. Paths given after <base> are allowed as well.
mb=$(git merge-base "$base" HEAD) || { err "e) no merge-base with $base"; mb=$base; }
outside=$( { git diff --name-only "$mb" -- . "${excludes[@]}"; git ls-files --others --exclude-standard -- . "${excludes[@]}"; } | sort -u)
[ -z "$outside" ] || err "e) files outside pi/ changed since $base: $(echo $outside)"
# The bracket keeps this line from matching itself.
if grep -rIqi 'herd[r]' pi; then err "e) pi/ mentions herd""r"; fi

# f) The tests in pi/scripts/ pass. They live inside pi/, so nothing outside pi/ runs them.
node --test --test-reporter=dot pi/scripts/*-test.js >/dev/null || err "f) tests in pi/scripts/ fail, run: node --test pi/scripts/*-test.js"

[ "$fail" -eq 0 ] && echo "check-references: ok"
exit "$fail"
