import json, subprocess, base64, sys, io
from PIL import Image
def gen(name, prompt, ref=None, model='google/gemini-3.1-flash-image'):
    content = [{'type': 'text', 'text': prompt}]
    if ref:
        b = base64.b64encode(open(ref, 'rb').read()).decode()
        content.append({'type': 'image_url', 'image_url': {'url': 'data:image/png;base64,' + b}})
    body = {'model': model, 'modalities': ['image', 'text'], 'messages': [{'role': 'user', 'content': content}]}
    r = subprocess.run(['curl', '-s', '-m', '280', 'https://openrouter.ai/api/v1/chat/completions', '-H', 'Content-Type: application/json', '-d', '@-'], input=json.dumps(body), capture_output=True, text=True)
    try:
        d = json.loads(r.stdout)
        url = d['choices'][0]['message']['images'][0]['image_url']['url']
        open(name + '.png', 'wb').write(base64.b64decode(url.split(',', 1)[1]))
        return 'ok'
    except Exception as e:
        return 'fail ' + r.stdout[:400]
if __name__ == '__main__':
    P = ('Use the exact same character as in the reference image (the woman with purple ponytail, teal jacket, beige trousers, red sneakers) in the same flat emoji style. '
         'Draw a side-view RUN CYCLE sprite sheet facing right: 8 frames in ONE horizontal row, evenly spaced, same size, same feet height, each frame a different phase of a running cycle (contact, down, passing, up, then the mirrored phases). '
         'Background: one flat solid pure magenta colour #FF00FF everywhere, no shadows, no ground, no text, no grid lines.')
    print(gen('sheet-run', P, 'emoji-flach.png'))
