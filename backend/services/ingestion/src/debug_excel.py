import pandas as pd
import numpy as np

df = pd.read_excel('/app/ignitiontags.xlsx')
df.columns = [str(c).strip() for c in df.columns]
print(f'Total rows: {len(df)}')
print(f'Columns: {df.columns.tolist()}')

before = len(df)
df = df.drop_duplicates(subset=['tag_name'], keep='last')
print(f'After dedup: {len(df)} rows, removed {before - len(df)} duplicates')

target = ['tag_name','node_path','category','equipment','type','description','unit','is_active','logging_tier']
available = [c for c in target if c in df.columns]
print(f'Target cols found: {available}')
print(f'Null tag_names: {df["tag_name"].isna().sum()}')
print(f'Null node_paths: {df["node_path"].isna().sum()}')
print(df[['tag_name','node_path']].head(3).to_string())
