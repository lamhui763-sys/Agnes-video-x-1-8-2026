import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    app = f.read()

app = app.replace('finalSystemPrompt += "\\n[CRITICAL HARD CONSTRAINT]: NO abstract background, NO gradients. Must be a concrete real environment.";',
                  'finalSystemPrompt += "\\n[CRITICAL HARD CONSTRAINT]: NO abstract background, NO gradients. Must be a concrete real environment.";')

# Actually, the python raw strings output actual newlines. I need to fix it.
# Let's search for the exact literal.
pattern = r'finalSystemPrompt \+= "(.*?)\n(.*?)";'
def fix_nl(m):
    return f'finalSystemPrompt += "{m.group(1)}\\n{m.group(2)}";'

app = re.sub(pattern, fix_nl, app)

pattern2 = r'finalPrompt \+= "(.*?)\n(.*?)";'
app = re.sub(pattern2, fix_nl, app)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app)
