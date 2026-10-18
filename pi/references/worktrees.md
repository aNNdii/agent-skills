# Worktrees

Every worktree rule of the flow lives here, and nowhere else. A phase skill links a section and runs it. It never restates the section's commands, paths, lists or question texts. Each section is one step with its input, commands and result.

Say notes and questions in the user's language (`language.md`). The texts below are the English source.

## Terms

- `<main>`: the path of the first `worktree` entry of `git worktree list --porcelain`. If that entry has a `bare` line, or there is no repo, worktree logic is off: say so in one line, skip every other section except Find the work item, and use `git rev-parse --show-toplevel` (else the current directory) as `<main>`.
- `<wtroot>`: `<dirname of <main>>/.worktrees/<basename of <main>>`. Example: `/workspace/agent-skills` gives `/workspace/.worktrees/agent-skills`. A repo directly in `$HOME` gives `~/.worktrees/<repo>`.
- `<topic>`: the name from Topic and branch. The spec dir, the worktree and the branch all carry it.
- `<branch>`: `feat/<topic>`, or `fix/<topic>` for a bug fix. In a detected linked worktree (Detect case 2), its current branch, empty when HEAD is detached.
- `<wt>`: the absolute path of the worktree a phase works in.
- Worktree of `<b>`: the path of the entry with the line `branch refs/heads/<b>` in `git -C <main> worktree list --porcelain`. An entry with a `prunable` line, or whose path does not exist, is stale and counts as no entry: then `<b>` has no worktree.
- Flow-owned worktree: a worktree whose path, as printed by `git -C <main> worktree list --porcelain`, starts with `<wtroot>/` (with the trailing slash). Every other worktree was not created by the flow: the flow adds no worktrees next to it and never offers to remove it.
- `<base>`: the branch the work starts from, or the full 40-character SHA (`git rev-parse HEAD`) when HEAD is detached.
- Protected branch: `main`, `master`, `develop`, every `release/*`, and the remote default. The remote default is the output of `git symbolic-ref --short refs/remotes/origin/HEAD` without the leading `origin/`. If that command fails, there is no remote default.
- The session keeps its working directory. Once a worktree is created or found, every later step uses `git -C <absolute path>` and absolute file paths, and names the path to the user.
- Never commit on a protected branch or in `<main>`, never push, never edit `.gitignore`.

## Find the work item

Input: a spec dir path, a topic, or nothing, plus what the caller looks for (for example the newest approved `spec.md`, or the newest item that is not `done`). Result: the spec dir and where it was found, `main` or `worktree`. New items are always created in `<main>/.specs/`, never here.

1. Search places, in this order: `<main>/.specs/*/`, then `.specs/*/` of the current worktree (`git rev-parse --show-toplevel`) when that is not `<main>`. Without a repo, only `.specs/*/` of the current directory.
2. A path from the request: use it as given.
3. A topic: the first dir `*-<topic>/` in the search places.
4. Nothing given: collect the candidates, then use the newest of them by date prefix. If several share the newest date, list them and ask which one.
   1. In a linked worktree (`git rev-parse --show-toplevel` is not `<main>`) where `git branch --show-current` prints a branch `<cur>`: the dirs in `<main>/.specs/` that match what the caller looks for, are open (their `plan.md` is missing or not `Status: done`, as in Resume or collision step 1), and whose `spec.md` has the line `Branch: <cur> · …`. Search the worktree's `.specs/` the same way only when `<main>/.specs/` has no such dir.
   2. No candidate from step 4.1, in `<main>`, or HEAD detached: the dirs in `<main>/.specs/` that match what the caller looks for. Search the worktree's `.specs/` only when `<main>/.specs/` has no match.
5. Found only in the worktree: use it and say in one line "Using `<dir>` from this worktree's `.specs/`, not `<main>/.specs/`." Never move or copy it.
6. Nothing found: say so and let the caller decide.

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

1. Resume: a `spec.md` in the search places of Find the work item has the line `Branch: <branch> · …`, and its `plan.md` is missing or not `Status: done`. Then reuse that spec dir and the worktree of `<branch>` (Terms), if it has one. Nothing is created, and nothing is asked.
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
2. Linked worktree: `git rev-parse --show-toplevel` is not `<main>`, whatever its path, who created it, its branch, a detached HEAD, or its changes. Never ask a worktree question here, only give one of these notes, with `<path>` the toplevel:
   - Branch not protected: "Working in `<path>` on `<branch>`. Base assumption: `<base>`." See the base rule below.
   - Protected branch: "Working in `<path>` on `<branch>`. /build cannot commit here: switch this worktree to a non-protected branch yourself first." `<base>` is the current branch.
   - Detached HEAD: "Working in `<path>` on detached HEAD. /build cannot commit here: switch this worktree to a non-protected branch yourself first." `<branch>` is empty, `<base>` is the full SHA of HEAD.

   Base rule for a branch that is not protected: `<base>` is the nearest ancestor among these candidates: the branch of `<main>` if protected, the remote default, `main`, `master`, `develop`. Keep those that exist and are ancestors of HEAD (`git merge-base --is-ancestor <candidate> HEAD`), then take the one with the fewest commits in `git rev-list --count <candidate>..HEAD`; the list order only breaks ties. So a branch cut from `develop`, which itself comes from `main`, gets `develop`. If none fits, ask for the base instead of the note.
3. Main checkout with changes. Question: "Uncommitted changes in `<main>`: `<files>`. (a) carry them into a new worktree `<wtroot>/<topic>` on `<branch>` / (b) leave them here, new worktree from HEAD / (c) abort." Recommend (a) when the changed files belong to this request, else (b).
4. Main checkout on a protected branch or with detached HEAD. Question: "`<current branch>` is protected" (or "HEAD is detached"), then "(a) new worktree `<wtroot>/<topic>` on `<branch>` now (recommended) / (b) only at /build."
5. Main checkout on a branch that is not protected, clean. Question: "(a) new worktree `<wtroot>/<topic>` on `<branch>` (recommended) / (b) spec and plan here, worktree at /build."

Before a case 3-5 question, run Topic and branch. If Resume or collision returns `resume`, replace the question with the note "Resuming `<spec dir>` on `<branch>`."

Choices: `carry` (3a), `leave` (3b), `abort` (3c), `now` (4a, 5a), `later` (4b, 5b). `<base>` for every choice is the current branch, or the full SHA when detached.

## Create

Input: `<topic>`, `<branch>`, `<base>`. Excludes has run, and Resume or collision returned `new` (or Locate for build called this section). Result: the absolute worktree path.

0. If `<branch>` has a stale entry (Worktree of `<b>` in Terms), drop only that entry first: `git -C <main> worktree remove <path of the stale entry>`. It removes git's admin data of that one worktree, never a dir, a branch or another entry. If git refuses (for example the entry is locked), stop (Stops and recovery).
1. `git -C <main> worktree add --no-track -b <branch> <wtroot>/<topic> <base>`. Git creates missing parent dirs itself. `--no-track` keeps `<branch>` from taking `<base>` as its upstream. If `<branch>` exists already (`git -C <main> show-ref --verify --quiet refs/heads/<branch>` succeeds), check it out instead of creating it: `git -C <main> worktree add <wtroot>/<topic> <branch>`.
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
Worktree: linked
Carried changes: yes
```

The `Branch` line is always there, except in case 1. `Worktree: linked` appears only in Detect case 2, and on resume when the resumed spec has it. `Carried changes: yes` appears only after a successful spec step of Carried changes. The two optional lines are independent of each other, and each is omitted when it does not apply. The values come from the Detect case and the choice:

| Case and choice | `Branch` | `Base` |
|---|---|---|
| 1 | no header lines | |
| 2, branch not protected | the current branch | the confirmed base assumption |
| 2, protected branch | the current branch | the current branch |
| 2, detached HEAD | empty | the full SHA of HEAD |
| 3 carry or leave, 4 now, 5 now | `<branch>` of the new worktree | the `<base>` it was created from |
| 4 later, 5 later | the planned `<branch>` | the current branch, or the full SHA when detached |
| resume | copied from the resumed spec | copied from the resumed spec |

`/plan` copies only the `Branch` line verbatim into `Execution`. From then on the plan is the only source for branch and base. Later phases never derive the base from the current branch. `Worktree` and `Carried changes` stay in `spec.md`, and `/build` reads them from there.

## Locate for build

Input: the plan's `Execution` line `Branch: <branch> · Base: <base>`, the spec dir `<YYYY-MM-DD>-<topic>`, which gives `<topic>`, and the Spec header of its `spec.md`, which gives `Worktree` and `Carried changes`. Result: the absolute path `<wt>` of the worktree on `<branch>`. It is never `<main>`.

1. Read `<branch>` and `<base>` only from that line. If the line is missing or a value is empty (for example a spec from Detect case 1), stop.
2. If `<branch>` is protected (Terms), refuse and stop. Nothing is changed.
3. Take the worktree of `<branch>` (Terms).
   - Its path is not `<main>`: use it as `<wt>`, under whatever path it lives. Skip the remaining steps.
   - Its path is `<main>`: the branch is checked out in the main checkout. Go on with step 4.
   - None, and the spec header has `Worktree: linked`: stop and ask "The worktree of `<branch>` is gone. (a) drop its stale entry and create `<wtroot>/<topic>` / (b) abort and recreate it yourself." (a) goes on with step 4, and Create drops the stale entry first. (b) stops without changes.
   - None: go on with step 4. Create drops a stale entry first.
4. Run Excludes.
5. `git -C <main> status --porcelain -- . ':!.specs'` lists changes, and the branch is not in `<main>`: ask the Detect case 3 question, with `<branch>` and `<wtroot>/<topic>` from this plan. `carry` and `leave` go on, `abort` stops without changes.
6. The branch is in `<main>`: ask before switching, also when the spec header has `Worktree: linked`. Clean: "`<branch>` is checked out in `<main>`. To build in a worktree, `<main>` switches to `<base>`. (a) switch and create `<wtroot>/<topic>` (recommended) / (b) abort." With changes, add `<files>` and offer only (a) switch, carry the changes into `<wtroot>/<topic>` / (b) abort, because the changes were made on `<branch>`. On (a): `git -C <main> switch <base>`, or `git -C <main> switch --detach <base>` when `<base>` is a SHA. If git refuses, stop.
7. Run Create with `<topic>`, `<branch>`, `<base>`. It reuses an existing `<branch>`.
8. For `carry`, run the spec step of Carried changes with the new `<wt>`. It writes `Carried changes: yes` into the spec, so the build step commits `[wip]` next.
9. Tell the user: "Building in `<wt>` on `<branch>`."

## Workstreams

Input: `<wt>` and `<branch>` from Locate for build, after the build step of Carried changes, and the workstream names from `Execution`. Result: per name `{ name, worktree, branch }` for the build workflow. Skip this section for one workstream: then `<wt>` on `<branch>` is the only workstream.

If `<wt>` is not a flow-owned worktree (Terms), create nothing and say "Running all workstreams in `<wt>`, one after another." The result is one workstream `main` with `<wt>` on `<branch>` and all tasks in plan order. Skip the steps below, so there is no merge-back.

1. Each name is ASCII lowercase kebab-case. `<start>` is the current HEAD of `<branch>`, after `[wip]`: `git -C <wt> rev-parse HEAD`.
2. Per name: if `<branch>-<name>` has a worktree (Terms), reuse it (resume). Else run Create with the topic `<topic>-<name>`, the branch `<branch>-<name>` and the base `<start>`.
3. After the build, merge back inside `<wt>`, one workstream at a time: `git -C <wt> -c commit.gpgsign=false merge --no-edit <branch>-<name>`, then run the plan's `Verify per task` in `<wt>`. On a conflict or a red `Verify per task`, stop.

## Squash base

Input: `<wt>`, `<branch>` and `<base>` from the plan. Run in Finish of `/review`, before the squash. Read-only. Result: `<onto>`, the commit that the squash resets to, `no squash`, or a question. `<mb>` is `git -C <wt> merge-base HEAD <base>`, so new commits on `<base>` never get into the squash.

1. A flow commit is a commit whose subject contains `[wip]`, `[T<n>]`, `[final]` or `[review-<n>]`, with `<n>` a number. Only the subject counts.
2. `git -C <wt> log --first-parent --no-merges --format='%H %s' <base>..HEAD` lists the commits on the branch's own line since `<base>`, newest first. Merge commits are left out, and so are the commits a merge brought in from another branch: the merge-backs of Workstreams never count, and the content of a merged branch goes into the squash. Every listed commit that is not a flow commit is a user commit.
3. No user commit: `<onto>` is `<mb>`. Ask nothing.
4. User commits: list them with short SHA and subject, then ask "These commits on `<branch>` were not made by the flow: `<commits>`. (a) squash them too / (b) keep them, squash only the flow commits." If `git -C <wt> log --first-parent --no-merges --format='%h %s' <base>..<newest user commit>` lists flow commits, add to the question: "(b) also keeps the flow commits `<commits>` as they are, because they are older than `<newest user commit>`." If the newest user commit is HEAD (the first commit in the list of step 2), no flow commit is newer than it: (b) reads "(b) keep the history as it is, squash nothing" instead.
5. (a): `<onto>` is `<mb>`. (b): `<onto>` is the full SHA of the newest user commit, the first user commit in the list of step 2. If that commit is HEAD, the result is `no squash`.

Example: the user committed A, then B, and the build added T1, T2. Step 2 lists T2, T1, B, A, so A and B are user commits. (a) leaves one commit on `<mb>`. (b) resets to B and leaves A, B, then one flow commit. With A, T1, B, T2 instead, (b) also resets to B, and the question names T1, which stays under B.

## Stops and recovery

On a stop, report the state and the options below, then end your turn. Never drop a stash, or remove a worktree or branch, without asking.

| Stop | Report | Options |
|---|---|---|
| `<wtroot>` cannot be created or written (read-only parent, not mounted) | the path, git's error, and whether `<branch>` now exists | fix the parent and run Create again, which reuses `<branch>` / choose `later` / abort, then delete the unused `<branch>` with `git -C <main> branch -d <branch>` after asking |
| `stash@{0}` does not end in `flow:<topic>` | `git -C <main> stash list` | nothing was moved, `<main>` still has the changes, the new worktree is clean: pop the right entry by hand / continue with `leave` / abort |
| `stash pop` conflicts or fails | the failing files, `git -C <wt> status --porcelain` (a failed pop can leave part of the changes in `<wt>`), and that the stash `flow:<topic>` is kept | resolve in `<wt>`, then drop the stash after asking / clear `<wt>` and pop again / restore in `<main>` with `git -C <main> stash pop` |
| Topic still taken after `-2`, or a leading part of `<branch>` is a branch | the taken names | the user names a topic |
| No base found in Detect case 2 | the candidates that were tried | the user names the base |
| Plan has no `Branch: <branch> · Base: <base>` line, or a value is empty | the plan path and its `Execution` lines | the user names branch and base, and they go into `Execution` / for a plan from a detached linked worktree: switch the worktree to a non-protected branch yourself, then correct `Execution` and the spec's `Branch:` line / abort. The flow changes nothing |
| `<branch>` in the plan is protected | the branch | correct `Execution` in the plan / for a plan from a linked worktree: switch the worktree to a non-protected branch yourself, then correct `Execution` and the spec's `Branch:` line / abort. Never build on it, the flow changes nothing |
| The worktree of `<branch>` is gone, the spec has `Worktree: linked`, and the user chose (b) | the branch, and its stale entry in `git -C <main> worktree list --porcelain` or that there is none | nothing was changed: recreate the worktree yourself and run /build again / run /build again and choose (a) |
| Create cannot drop the stale entry of `<branch>` | the entry from `git -C <main> worktree list --porcelain` and git's error | unlock or remove the entry yourself and run /build again / abort |
| The user aborts the case 3 or switch question, or `git -C <main> switch` fails | git's error, if any | nothing was changed: commit or stash in `<main>` by hand and run /build again / abort |
| Uncommitted changes in `<wt>` that are not carried changes, or `[wip]` exists already | `git -C <wt> status --porcelain` | commit them in `<wt>` as an unsigned checkpoint / stash them in `<wt>` / abort |
| Merge of `<branch>-<name>` conflicts, or `Verify per task` is red after it | the conflicting files or the verify output | resolve in `<wt>` and run `Verify per task` / `git -C <wt> merge --abort` and fix the workstream / abort |

## Parent requirements

Worktrees live next to the repo, in `<wtroot>` under the repo's parent dir. The flow assumes that:

- The parent dir of `<main>` is writable, so Create can make `<wtroot>`. If it is not (read-only, or not mounted), Create stops (Stops and recovery). There is no fallback path.
- The parent dir is persistent. A worktree in a temporary or container-only dir disappears with it. Its commits stay in the repo, but uncommitted work is lost, and git keeps a stale entry until it is dropped (next point).
- Deleting a repo leaves its `<wtroot>` behind. Git cannot clean it from the deleted repo, so remove the orphaned dir by hand after checking it holds nothing you need: `rm -rf <dirname of the repo>/.worktrees/<repo>`. Remove `<dirname of the repo>/.worktrees` too once it is empty.
- To remove a single worktree while the repo stays, ask first (Stops and recovery), then run `git -C <main> worktree remove <path>`. The same command drops the entry of a dir that was deleted by hand. `git -C <main> worktree prune` drops the entries of every missing dir at once, including moved or unmounted worktrees, so run it only by hand.
