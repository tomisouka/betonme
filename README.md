# Return Files Early

**Before using more than 1/3 of your total tool call budget, copy all completed output files to `/mnt/user-data/outputs/` and call `present_files` to surface them to the user.**

This ensures files are delivered even if the session is cut off before you finish.

## Rule

- Estimate your total tool calls for the task upfront.
- At the 1/3 mark, pause and deliver whatever is complete so far.
- Continue working, but the user already has something usable.

## Example

If a task will take ~15 tool calls, present completed files by call ~5. Don't wait until the end.
