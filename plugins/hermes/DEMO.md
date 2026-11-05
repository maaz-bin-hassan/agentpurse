# 80-second Hermes demo

Use a Hermes 0.22.7+ chat with this plugin enabled and `AGENTPURSE_API_KEY` set to `agpk_grocer_demo_maaz`. Leave YOLO off. Approvals must be on. The purse is the public sandbox at `https://agentpurse.vercel.app`. Grocer's allowance is groceries, and Lucky Chips is a blocked merchant.

Say the lines in the Prompt column out loud or paste them. Do not reword the two buy lines: the amounts are part of the shot.

| Time | Shot | Prompt or action | What the frame shows |
| --- | --- | --- | --- |
| 0:00 | Budget | `/purse budget` | Grocer's remaining allowance in dollars and cents. Kill switch off. Hermes limit $50.00. |
| 0:10 | Ask | `Buy oat milk from Green Grocer for $2.55` | Hermes calls `get_quote`, then stops on its own approval card before any payment. |
| 0:25 | Card | Approve the card | The card names Green Grocer, $2.55 (255 cents), the remaining allowance, and guard `pass`. |
| 0:40 | Receipt | (none — wait for the tool result) | A captured sandbox receipt with a PayPal order id. The reply says no retailer order was placed. |
| 0:50 | Block | `Buy chips from Lucky Chips for $10` | A refusal. Lucky Chips is blocked. No approval card, no order id. |
| 1:05 | Kill | `/purse kill` | "Kill switch is on." |
| 1:12 | Refused | `Buy oat milk from Green Grocer for $2.55` | The next buy is refused because the kill switch is on. Nothing is sent to PayPal. |

If the clerk holds a larger cheque instead of capturing, the reply includes an approval URL on `/purses/purse_maaz` and the plugin stops waiting at the configured timeout. $2.55 is under Grocer's approval line, so the sandbox path captures after you approve the Hermes card.

Turn the switch back off with `/purse resume` when the recording is done. The following purchase still needs a fresh approval.
