# Worktrees

Every worktree rule of the flow lives here, and nowhere else. A phase skill links a section and runs it. It never restates the section's commands, paths, lists or question texts. Each section is one step with its input, commands and result.

Say notes and questions in the user's language (`language.md`). The texts below are the English source.

## Terms

- `<main>`: the path of the first `worktree` entry of `git worktree list --porcelain`. If that entry has a `bare` line, or there is no repo, worktree logic is off: say so in one line, skip every other section except Find the work item, and use `git rev-parse --show-toplevel` (else the current directory) as `<main>`.
- `<wtroot>`: `<dirname of <main>>/.worktrees/<basename of <main>>`. Example: `/workspace/agent-skills` gives `/workspace/.worktrees/agent-skills`. A repo directly in `$HOME` gives `~/.worktrees/<repo>`.
- `<topic>`: the name from Topic and branch. The spec dir, the worktree and the branch all carry it.
- `<branch>`: `feat/<topic>`, or `fix/<topic>` for a bug fix. In a detected linked worktree (Detect case 2), its current branch.
- `<base>`: the branch the work starts from, or the full 40-character SHA (`git rev-parse HEAD`) when HEAD is detached.
- Protected branch: `main`, `master`, `develop`, every `release/*`, and the remote default. The remote default is the output of `git symbolic-ref --short refs/remotes/origin/HEAD` without the leading `origin/`. If that command fails, there is no remote default.
- The session keeps its working directory. Once a worktree is created or found, every later step uses `git -C <absolute path>` and absolute file paths, and names the path to the user.
- Never commit on a protected branch or in `<main>`, never push, never edit `.gitignore`.

## Find the work item

Input: a spec dir path, a topic, or nothing, plus what the caller looks for (for example the newest approved `spec.md`, or the newest item that is not `done`). Result: the spec dir and where it was found, `main` or `worktree`. New items are always created in `<main>/.specs/`, never here.

1. Search places, in this order: `<main>/.specs/*/`, then `.specs/*/` of the current worktree (`git rev-parse --show-toplevel`) when that is not `<main>`. Without a repo, only `.specs/*/` of the current directory.
2. A path from the request: use it as given.
3. A topic: the first dir `*-<topic>/` in the search places.
4. Nothing given: the newest dir (by its date prefix) that matches what the caller looks for, in `<main>/.specs/`. Search the worktree's `.specs/` only when `<main>/.specs/` has no match.
5. Found only in the worktree: use it and say in one line "Using `<dir>` from this worktree's `.specs/`, not `<main>/.specs/`." Never move or copy it.
6. Nothing found: say so and let the caller decide.

## Working directory

Input: the spec's `Branch:` line, or the plan's `Execution` line. Result: `<wd>`, an absolute path. `/plan` and `/spec` read the code there, because the session may run in `<main>` while the work lives in a worktree.

1. Take `<branch>` from that line. If the line is missing or `<branch>` is empty, `<wd>` is `git rev-parse --show-toplevel` of the current directory. Skip the remaining steps.
2. In `git -C <main> worktree list --porcelain`, find the entry with the line `branch refs/heads/<branch>`. Its path is `<wd>`. No entry: `<wd>` as in step 1.
3. When `<wd>` is not the current directory's toplevel, say in one line: "Reading code in `<wd>`."
4. Read, grep and test only under `<wd>`, with absolute paths. Pass `<wd>` as `repo` to workflows.

## Excludes

Run before the first spec is written, and before any stash. Only `.specs/` is excluded. Worktrees live outside the repo and need no entry.

1. `git -C <main> rev-parse --path-format=absolute --git-path info/exclude` prints the exclude file.
2. If no line of that file is exactly `.specs/`, append the line `.specs/`. Create the file if it is missing.

Result: `git -C <main> status --porcelain` does not list `.specs/`. Skip this section when there is no repo or the repo is bare.

## Topic and branch

Input: the request, or a name the user gave. Result: `<topic>` and `<branch>`.

1. Propose a topic that names the request: 2-4 words, ASCII lowercase, kebab-case, no `/`. Example: "Worktree-Support erweitern" gives `flow-worktrees`.
2. Normalize a name from the user the same way: `ä ö ü ß` become `ae oe ue ss`, other letters lose their accents, every other run of characters becomes one `-`, and leading or trailing `-` go.
3. `<branch>` is `fix/<topic>` for a bug fix, else `feat/<topic>`.
4. `git check-ref-format --branch <branch>` must succeed. Otherwise propose another topic.
5. Run Resume or collision.
6. Show `<topic>`, `<branch>` and `<wtroot>/<topic>` to the user, inside the Detect note or question, before anything is created.

## Resume or collision

Input: `<topic>`, `<branch>`. Result: `new`, `resume` with the spec dir, or the topic `<topic>-2`.

1. Resume: a `spec.md` in the search places of Find the work item has the line `Branch: <branch> · …`, and its `plan.md` is missing or not `Status: done`. Then reuse that spec dir and the worktree of `<branch>`. Nothing is created, and nothing is asked.
2. Otherwise the name is taken when any of these holds:
   - `git -C <main> show-ref --verify --quiet refs/heads/<branch>` succeeds;
   - `git -C <main> for-each-ref refs/heads/<branch>/` prints a ref (directory/file ref conflict);
   - `<wtroot>/<topic>` exists;
   - a dir `<main>/.specs/*-<topic>/` exists.
3. Taken: propose `<topic>-2` for the spec dir, the worktree and the branch together, and check it with steps 1-2 again. If `<topic>-2` is taken as well, or a leading part of `<branch>` is itself a branch (`feat` for `feat/<topic>`), ask the user for a name.
4. Free: `new`.

## Detect

Run after recon. Read-only. Result: the case number plus a one-line note (cases 1-2) or a question (cases 3-5). The first matching case wins.

Probes, run in the current directory:

- `git rev-parse --git-dir` fails: no repo.
- `git worktree list --porcelain`: the first entry is `<main>`, and a `bare` line in it means bare.
- `git rev-parse --verify -q HEAD` fails: no commit.
- `git rev-parse --show-toplevel` is the current checkout. It is the main checkout when it equals `<main>`, else a linked worktree.
- `git branch --show-current` is the current branch. Empty means detached HEAD.
- `git -C <main> status --porcelain -- . ':!.specs'` lists the changes in `<main>`.

Cases:

1. No repo, no commit, or bare. Note: "No git repo" / "No commit yet" / "Bare repository", then ": working without a worktree." Write the spec in place, without header lines.
2. Linked worktree, current branch not protected (with or without changes). Note: "Working in `<path>` on `<branch>`. Base assumption: `<base>`." `<base>` is the nearest ancestor among these candidates: the branch of `<main>` if protected, the remote default, `main`, `master`, `develop`. Keep those that exist and are ancestors of HEAD (`git merge-base --is-ancestor <candidate> HEAD`), then take the one with the fewest commits in `git rev-list --count <candidate>..HEAD`; the list order only breaks ties. So a branch cut from `develop`, which itself comes from `main`, gets `develop`. If none fits, ask for the base instead of the note.
3. Main checkout with changes. Question: "Uncommitted changes in `<main>`: `<files>`. (a) carry them into a new worktree `<wtroot>/<topic>` on `<branch>` / (b) leave them here, new worktree from HEAD / (c) abort." Recommend (a) when the changed files belong to this request, else (b).
4. Protected branch or detached HEAD, in the main checkout or in a linked worktree. Question: "`<current branch>` is protected" (or "HEAD is detached"), then "(a) new worktree `<wtroot>/<topic>` on `<branch>` now (recommended) / (b) only at /build."
5. Main checkout on a branch that is not protected, clean. Question: "(a) new worktree `<wtroot>/<topic>` on `<branch>` (recommended) / (b) spec and plan here, worktree at /build."

Before a case 3-5 question, run Topic and branch. If Resume or collision returns `resume`, replace the question with the note "Resuming `<spec dir>` on `<branch>`."

Choices: `carry` (3a), `leave` (3b), `abort` (3c), `now` (4a, 5a), `later` (4b, 5b). `<base>` for every choice is the current branch, or the full SHA when detached.

## Create

Input: `<topic>`, `<branch>`, `<base>`. Excludes has run, and Resume or collision returned `new` (or Locate for build called this section). Result: the absolute worktree path.

1. `git -C <main> worktree add <wtroot>/<topic> -b <branch> <base>`. Git creates missing parent dirs itself. If `<branch>` exists already (`git -C <main> show-ref --verify --quiet refs/heads/<branch>` succeeds), check it out instead of creating it: `git -C <main> worktree add <wtroot>/<topic> <branch>`.
2. If it fails because `<wtroot>` cannot be created or written, stop (Stops and recovery). Never fall back to another path. Git may have created `<branch>` before it failed: check with `show-ref` as in step 1 and name it in the report. A rerun of this step then takes the existing-branch variant of step 1.
3. Tell the user: "Worktree: `<wtroot>/<topic>` on `<branch>`." Every later step uses that absolute path.

## Carried changes

### Spec step

Input: `<topic>`, the worktree `<wt>` that Create just made. Run only for the choice `carry`.

1. `git -C <main> stash push -u -m "flow:<topic>"`
2. `git -C <main> stash list -1 --format=%gs` must end in `flow:<topic>`. Otherwise stop and pop nothing.
3. `git -C <wt> stash pop stash@{0}`. On a conflict or any error, stop. The stash stays.
4. Now `git -C <main> status --porcelain` is empty and `git -C <wt> status --porcelain` shows the changes, uncommitted.
5. Add `Carried changes: yes` to the spec header.

### Build step

Input: the worktree `<wt>` from Locate for build, `<base>` from the plan, and the spec header. Run once in `<wt>` before the baseline. Result: `committed`, `nothing to do`, or a stop.

1. `git -C <wt> status --porcelain` is empty: nothing to do.
2. The spec header has `Carried changes: yes`, and no subject in `git -C <wt> log --format=%s <base>..HEAD` contains `[wip]`: commit the whole state once, unsigned:
   `git -C <wt> add -A`, then `git -C <wt> -c commit.gpgsign=false commit -m "chore: carried changes [wip]"`. Result: `committed`.
3. Otherwise (no carried changes, or `[wip]` exists already): stop with the file list and the question commit / stash / abort (Stops and recovery). A rerun therefore never writes a second `[wip]`.

`/review` squashes `[wip]` together with the task commits.

## Spec header

The lines right after `Status:` in `spec.md`:

```text
Branch: <branch> · Base: <base>
Carried changes: yes
```

The second line appears only after a successful spec step of Carried changes. The values come from the Detect case and the choice:

| Case and choice | `Branch` | `Base` |
|---|---|---|
| 1 | no header lines | |
| 2 | the current branch | the confirmed base assumption |
| 3 carry or leave, 4 now, 5 now | `<branch>` of the new worktree | the `<base>` it was created from |
| 4 later, 5 later | the planned `<branch>` | the current branch, or the full SHA when detached |
| resume | copied from the resumed spec | copied from the resumed spec |

`/plan` copies the `Branch` line verbatim into `Execution`. From then on the plan is the only source. Later phases never derive the base from the current branch.

## Locate for build

Input: the plan's `Execution` line `Branch: <branch> · Base: <base>`, and the spec dir `<YYYY-MM-DD>-<topic>`, which gives `<topic>`. Result: the absolute path `<wt>` of the worktree on `<branch>`. It is never `<main>`.

1. Read `<branch>` and `<base>` only from that line. If the line is missing or a value is empty (for example a spec from Detect case 1), stop.
2. If `<branch>` is protected (Terms), refuse and stop. Nothing is changed.
3. In `git -C <main> worktree list --porcelain`, find the entry with the line `branch refs/heads/<branch>`.
   - Its path is not `<main>`: use it as `<wt>`, under whatever path it lives. Skip the remaining steps.
   - Its path is `<main>`: the branch is checked out in the main checkout. Go on with step 4.
   - No entry: go on with step 4.
4. Run Excludes.
5. `git -C <main> status --porcelain -- . ':!.specs'` lists changes, and the branch is not in `<main>`: ask the Detect case 3 question, with `<branch>` and `<wtroot>/<topic>` from this plan. `carry` and `leave` go on, `abort` stops without changes.
6. The branch is in `<main>`: ask before switching. Clean: "`<branch>` is checked out in `<main>`. To build in a worktree, `<main>` switches to `<base>`. (a) switch and create `<wtroot>/<topic>` (recommended) / (b) abort." With changes, add `<files>` and offer only (a) switch, carry the changes into `<wtroot>/<topic>` / (b) abort, because the changes were made on `<branch>`. On (a): `git -C <main> switch <base>`, or `git -C <main> switch --detach <base>` when `<base>` is a SHA. If git refuses, stop.
7. Run Create with `<topic>`, `<branch>`, `<base>`. It reuses an existing `<branch>`.
8. For `carry`, run the spec step of Carried changes with the new `<wt>`. It writes `Carried changes: yes` into the spec, so the build step commits `[wip]` next.
9. Tell the user: "Building in `<wt>` on `<branch>`."

## Workstreams

Input: `<wt>` and `<branch>` from Locate for build, after the build step of Carried changes, and the workstream names from `Execution`. Result: per name `{ name, worktree, branch }` for the build workflow. Skip this section for one workstream: then `<wt>` on `<branch>` is the only workstream.

1. Each name is ASCII lowercase kebab-case. `<start>` is the current HEAD of `<branch>`, after `[wip]`: `git -C <wt> rev-parse HEAD`.
2. Per name: if `git -C <main> worktree list --porcelain` has an entry on `refs/heads/<branch>-<name>`, reuse it (resume). Else run Create with the topic `<topic>-<name>`, the branch `<branch>-<name>` and the base `<start>`.
3. After the build, merge back inside `<wt>`, one workstream at a time: `git -C <wt> -c commit.gpgsign=false merge --no-edit <branch>-<name>`, then run verify in `<wt>`. On a conflict or a red verify, stop.

## Stops and recovery

On a stop, report the state and the options below, then end your turn. Never drop a stash, or remove a worktree or branch, without asking.

| Stop | Report | Options |
|---|---|---|
| `<wtroot>` cannot be created or written (read-only parent, not mounted) | the path, git's error, and whether `<branch>` now exists | fix the parent and run Create again, which reuses `<branch>` / choose `later` / abort, then delete the unused `<branch>` with `git -C <main> branch -d <branch>` after asking |
| `stash@{0}` does not end in `flow:<topic>` | `git -C <main> stash list` | nothing was moved, `<main>` still has the changes, the new worktree is clean: pop the right entry by hand / continue with `leave` / abort |
| `stash pop` conflicts or fails | the failing files, `git -C <wt> status --porcelain` (a failed pop can leave part of the changes in `<wt>`), and that the stash `flow:<topic>` is kept | resolve in `<wt>`, then drop the stash after asking / clear `<wt>` and pop again / restore in `<main>` with `git -C <main> stash pop` |
| Topic still taken after `-2`, or a leading part of `<branch>` is a branch | the taken names | the user names a topic |
| No base found in Detect case 2 | the candidates that were tried | the user names the base |
| Plan has no `Branch: <branch> · Base: <base>` line, or a value is empty | the plan path and its `Execution` lines | the user names branch and base, and they go into `Execution` / abort |
| `<branch>` in the plan is protected | the branch | correct `Execution` in the plan / abort. Never build on it |
| The user aborts the case 3 or switch question, or `git -C <main> switch` fails | git's error, if any | nothing was changed: commit or stash in `<main>` by hand and run /build again / abort |
| Uncommitted changes in `<wt>` that are not carried changes, or `[wip]` exists already | `git -C <wt> status --porcelain` | commit them in `<wt>` as an unsigned checkpoint / stash them in `<wt>` / abort |
| Merge of `<branch>-<name>` conflicts, or verify is red after it | the conflicting files or the verify output | resolve in `<wt>` and run verify / `git -C <wt> merge --abort` and fix the workstream / abort |

## Parent requirements

Worktrees live next to the repo, in `<wtroot>` under the repo's parent dir. The flow assumes that:

- The parent dir of `<main>` is writable, so Create can make `<wtroot>`. If it is not (read-only, or not mounted), Create stops (Stops and recovery). There is no fallback path.
- The parent dir is persistent. A worktree in a temporary or container-only dir disappears with it. Its commits stay in the repo, but uncommitted work is lost, and git keeps a stale entry until `git -C <main> worktree prune`.
- Deleting a repo leaves its `<wtroot>` behind. Git cannot clean it from the deleted repo, so remove the orphaned dir by hand after checking it holds nothing you need: `rm -rf <dirname of the repo>/.worktrees/<repo>`. Remove `<dirname of the repo>/.worktrees` too once it is empty.
- To remove a single worktree while the repo stays, ask first (Stops and recovery), then run `git -C <main> worktree remove <path>`. For a dir that was deleted by hand, run `git -C <main> worktree prune`.
