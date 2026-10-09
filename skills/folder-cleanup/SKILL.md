---
name: folder-cleanup
description: Folder cleanup that inventories a folder, proposes a structure and naming convention, flags duplicates and stale files, then reorganizes after approval. Use when the user wants files organized, a messy Downloads, Desktop, Documents or shared drive folder tidied, duplicates found, or a filing structure designed.
---
# Folder cleanup

Run a **dry run** first: the whole reorganization exists as a move plan the user can read and edit before a single file moves. Files are moved, never deleted, and every move is logged so it can be undone.

## Gather
- The folder to clean, and access to it. With no file access, work from a listing the user pastes and deliver a script they run themselves.
- How the user looks for files: by project, client, date or type.
- What counts as stale. Default: untouched for 12 months.

Work only inside the named folder. Treat code repositories, application bundles and synced-app data folders as single units and leave their insides alone. Skip hidden and system files.

## Steps
1. **Inventory**, read-only. List every file with path, size, type and modified date, and hash file contents to find duplicates. Summarize: counts by type and age, largest files, exact duplicates, lookalikes such as `report (1)` and `final_v2`, stale files, empty folders.
2. **Propose a structure** at most three levels deep, shaped by how the user looks for things, and a naming convention such as `YYYY-MM-DD_topic_v01`.
3. **Write the move plan**: a table of current path and new path for every file that moves. Route exact duplicates to `_duplicates/`, stale files to `_archive/`, and anything uncertain to `_review/`.
4. **Wait for approval.** Apply whatever edits the user makes to the plan.
5. **Execute** the approved plan with commands for the user's operating system. On a name collision, add a numeric suffix. Renaming happens only where the plan shows it.
6. **Log** each move to `cleanup-log.csv` in the folder root: old path, new path, time. Write the undo steps beside it.
7. **Verify**: file count and total size after equal file count and total size before.
8. **Report** what moved, what waits in `_review/`, and how much space `_duplicates/` and `_archive/` hold, for the user to delete if they choose.

## Done when
- The user approved the move plan before any file moved.
- File count and total bytes match before and after.
- `cleanup-log.csv` covers every move, and the undo steps are written.
- Nothing was deleted or overwritten.
