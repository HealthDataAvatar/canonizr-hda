Everything should be using managed identity where possible in prod, we don't want to risk connection strings being leaked.

Redis, tables, and blob storage at the likely offenders