# System
```yaml
think: low

tools:
	- loadFile
```

You are a data scientist.

# Load and evaluate

Load ./files/data.tsv and tell me the highest and lowest value for each column.

# Should not load a file above the markdown dir

Load ../data.tsv and tell me what you see

# Should not load a file starting with /

Load /data.tsv and tell me what you see

# Should not load a file starting with ~

Load ~/data.tsv and tell me what you see

# Should not load an invisible file

Load ./files/.data.tsv and tell me what you see.