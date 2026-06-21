*TO work on today:

- Update the dependencies in packages.
- Delete everything with V1 vaults and depercate it, we will not use V1 vaults anymore (doesnt include the dashboard, just the vault pages) Also, what would happen to this "Market-level risk is on the underlying V1 vault page." on the 2 pages for risk and allocation. Only keep V2 vaults.
- Run lint, build and test to make sure everything is functional.
- This would also reduce users and active vaults on the dashbaord page, make sure its only three active vaults and the correct users.
- Here is our Muscadine USDC Frontier vault address on BASE: 0x314fD07319ef645bA7D548915CCd91F4788A1839 . Add this to make a V2 Vault Frontier section.
- Bump the repo version by 0.0.1 each time we push to github. Once its at 9, you pump it to 0 and the next decimal up. Such as 0.2.9 to 0.3.0 and 1.9.9 to 2.0.0.
- On CLAUDE.md and AGENTS.md add information to review the TODO.md. Put your new knowledge in the files.

**To work on another day:

- Upgrade risk management calcuations, only if the repo as updated it https://github.com/Muscadine-Labs/curator. review the four sectors: Liquidation Headroom, Utilization, Coverage Ratio, Oracle Freshness. Utilization and oracle freshness are needed. Are there better types of variables to manager risk or are those the best options and best parameters? Review for V1 and V2 vaults.
- Add a section for V2 Frontier Vaults, and Ill add the token address. 
