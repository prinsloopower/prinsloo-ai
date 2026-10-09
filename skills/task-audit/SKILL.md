---
name: task-audit
description: Task audit that interviews the user about recurring work and recommends what to automate, template, schedule, delegate or stop. Use when the user wants to find time savings, identify repetitive tasks worth automating, review how they spend their week, or decide what to build next for their own productivity.
---
# Task audit

Hunt for **toil**: work that recurs, follows rules and produces the same shape of output each time. The audit prices each task in hours a month and ranks what to change first.

## Gather
- The user's role and a typical week.
- Signals from connected tools: recurring calendar events, repeated emails sent, reports produced on a cycle.
- Tools the user has available to automate with.

## Interview
Ask one question at a time, and stop when new answers stop adding tasks.
- "Walk me through last week, day by day. What did you do that you also did the week before?"
- For each task: what triggers it, how often, how long it takes, what goes in, what comes out, who uses the result.
- "Which of these would nobody notice if it stopped?"
- "Where do you copy something from one place to another?"
- "What do you put off because it is tedious?"

## Steps
1. Build the inventory: task, trigger, frequency, minutes each time, inputs, output, who uses it.
2. Compute hours a month for each task in code.
3. Classify each task.
   - **Stop**: nobody uses the output. Confirm with its recipient first.
   - **Automate**: rule-based, with digital inputs.
   - **Template**: same shape, different content.
   - **Schedule**: triggered by the clock.
   - **Delegate**: needs a person, though not this one.
   - **Keep**: depends on the user's judgment or relationships.
4. Score each change by hours saved a month and ease of making it. Rank them.
5. For the top five, write a spec: trigger, inputs, steps, output, tool, and the point where a person checks the result.
6. Split the list into quick wins for this week and projects.

## Shape
```
<hours> a month reviewed, <hours> reclaimable
| Task | Hours a month | Class | Change | Saves | Ease |
Top five specs
Quick wins | Projects
```

## Done when
- Every task has a class and a reason.
- Hours are computed, and the reclaimable total is stated.
- Each of the top five has a full spec.
- Every `Stop` names the recipient to confirm with.
