# Design red flags

Adapted from pstack (`skills/architect/references/design-red-flags.md`, MIT, Lauren Tan). Screen every design candidate against this list. A red flag is a reason to revise or reject the shape.

Assume the next contributor is an agent that sees only the files it opened, copies the nearest example, and takes the shortest path that compiles. Prefer the design where a change that looks right from one file is right for the whole repo.

- **Shallow module.** A large interface that hides little. Callers coordinate several methods for one operation, or public options expose internal stages. Prefer a small interface backed by substantial behavior. A deep module is not a deep call chain.
- **Information leakage.** The same internal decision (representation, policy, wire format) appears in more than one module, so a change needs coordinated edits. Parse external data into domain types behind the interface. Keep storage, framework, and protocol details private.
- **Temporal decomposition.** Modules split by execution order (load, validate, transform, save) that each repeat one representation and its invariants. Group by the knowledge a module owns.
- **Pass-through method.** Forwards the same arguments to another method of the same shape. Remove it unless it adds policy or adaptation.
- **Split ownership.** More than one module writes the same state or keeps its own copy. Give each piece of state one owner.
- **Two ways to do one task.** Agents copy whichever way they find first. Keep one.
- **Importable internals.** Callers can import internals, so internals become interface. Make them unreachable from outside.
- **Hand-synced list.** The same items listed in several places. Keep one list and derive the rest, or make the build fail when they disagree.
