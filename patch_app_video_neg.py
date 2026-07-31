import re

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    app = f.read()

# Pattern for handleGenerateVideo:
#       const baseNegatives = "abstract background, gradient, color blocks, fluid colors, blurry background, missing character, missing weapon, deformed hands";
#       if (finalNegativePrompt) {

pattern_vid = r'(?P<indent>[ \t]+)const baseNegatives = "(.*?)";(?P<nl>\n)(?P<indent2>[ \t]+)if \(finalNegativePrompt\) \{'

replacement_vid = """\g<indent>const baseNegatives = "\g<2>";\g<nl>
\g<indent>// Pre-check historical failures for negative prompt augmentation
\g<indent>let historicalFailuresVideo: string[] = [];
\g<indent>try {
\g<indent>  const expRes = await fetch(`/api/experience-summary?sceneId=${sceneId}`);
\g<indent>  if (expRes.ok) {
\g<indent>    const data = await expRes.json();
\g<indent>    historicalFailuresVideo = data.failures || [];
\g<indent>  }
\g<indent>} catch (e) {}

\g<indent>const hasAbstractBgIssueVid = historicalFailuresVideo.some(f => f.toLowerCase().includes("abstract") || f.toLowerCase().includes("gradient"));
\g<indent>const hasMissingContentIssueVid = historicalFailuresVideo.some(f => f.toLowerCase().includes("content missing") || f.toLowerCase().includes("missing"));

\g<indent>if (hasAbstractBgIssueVid) {
\g<indent>  finalNegativePrompt += ", gradient, color blocks, abstract background, purple blue abstract";
\g<indent>}
\g<indent>if (hasMissingContentIssueVid) {
\g<indent>  finalNegativePrompt += ", missing gun, missing character, empty scene";
\g<indent>}
\g<nl>\g<indent2>if (finalNegativePrompt) {"""

app = re.sub(pattern_vid, replacement_vid, app)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(app)
