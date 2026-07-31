import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    app = f.read()

# I injected this string:
injected = """  const handleGenerateAllSequentially = async () => {
    handleFullAutoVideoProduction();
  };

  const handleGenerateAllKeyframesSequentially = async () => {
    handleFullAutoVideoProduction();
  };

  const handleFullAutoVideoProduction = async () => {
"""

# Instead of relying on exact match which might have whitespace issues, let's just chop off everything from `const handleGenerateAllSequentially = async () => {` to the end, and replace with `  return (\n    <div className="min-h-screen bg-slate-950`
pattern = r'  const handleGenerateAllSequentially = async \(\) => \{.*'
replacement = r'  return (\n    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col selection:bg-pink-500 selection:text-white overflow-x-hidden">'
app = re.sub(pattern, replacement, app, flags=re.DOTALL)

# And fix handleGenerateVideoKeyframes at 3750
app = app.replace('handleGenerateVideoKeyframes(scene.id, i);', 'handleGenerateVideo(scene.id, true);')

# Wait, `handleGenerateAllSequentially` was causing an error originally at 8114:
# src/App.tsx(8114,34): error TS2304: Cannot find name 'handleGenerateAllSequentially'.
# We SHOULD define it, but JUST `handleGenerateAllSequentially`.
app = app.replace('onClick={handleGenerateAllSequentially}', 'onClick={() => handleFullAutoVideoProduction()}')

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app)
