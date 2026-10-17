// The host side of guizero (docs/FORMS-BRIDGE.md): a fake host records the bridge commands and answers the waits of
// app.display(), app.update() and the dialogs with events.

import { describe, it, expect } from 'vitest';
import { VM, compile, formsEvent } from '../src/index.js';

/**
 * Run a program with a recording host. `onWait(wait, h)` answers each forms wait (an event built with h.ev(...), a dialog
 * answer, or null); h.cmds holds [op, data] of every command so far, h.find(kind) the create data of the first widget of a kind.
 */
function session(src, onWait = () => null, opts = {}) {
  let output = '';
  const cmds = [];
  const h = {
    cmds,
    ops: (op) => cmds.filter((c) => c[0] === op).map((c) => c[1]),
    find: (kind, n = 0) => cmds.filter((c) => c[0] === 'create' && c[1].kind === kind)[n]?.[1],
    ev: (kind, ...args) => formsEvent(vm, kind, ...args),
    waits: [],
  };
  const host = {
    print: (t) => { output += t; },
    forms: (op, data) => {
      cmds.push([op, data]);
      if (op === 'image') return opts.images?.[data.path] ?? null;
      return undefined;
    },
  };
  const vm = new VM(compile(src), { host, seed: 1 });
  const task = vm.start();
  for (let guard = 0; guard < 1000; guard++) {
    const r = vm.run(task, 1e8);
    if (r.status !== 'waiting') break;
    const w = task.wait;
    h.waits.push(w);
    if (w.kind === 'forms-event' || w.kind === 'forms-dialog') vm.resume(task, onWait(w, h) ?? null);
    else vm.resume(task, null);
  }
  return { output, error: task.state === 'error' ? task.error : null, h, vm };
}

/** Answer the waits one after the other from a list of functions. */
const steps = (...fns) => {
  let i = 0;
  return (w, h) => (i < fns.length ? fns[i++](w, h) : null);
};

describe('guizero host bridge', () => {
  it('sends nothing before display(), then every widget with all its properties, layouts and display', () => {
    const { h, error } = session(`
from guizero import App, Text, PushButton, Box
app = App(title="Hi", width=300, height=200, bg="light blue")
t = Text(app, text="hello", size=20, color=(255, 0, 0))
t.value = "changed before display"
box = Box(app, layout="grid", align="left")
b1 = PushButton(box, text="one", grid=[0, 0])
b2 = PushButton(box, text="two", grid=[1, 2, 2, 1])
print(len(app.children))
app.display()
`);
    expect(error).toBeNull();
    const ops = h.cmds.map((c) => c[0]);
    expect(ops.slice(0, 5)).toEqual(['create', 'create', 'create', 'create', 'create']);
    expect(ops).toContain('display');
    expect(ops.filter((o) => o === 'set')).toEqual([]); // changes before the first flush are part of create
    const app = h.find('app');
    expect(app).toMatchObject({ id: 1, parent: null, props: { title: 'Hi', width: 300, height: 200, bg: '#add8e6', visible: true, layout: 'auto' } });
    const text = h.find('text');
    expect(text.parent).toBe(1);
    expect(text.props).toMatchObject({ text: 'changed before display', text_color: '#ff0000', enabled: true, bg: '#add8e6' });
    expect(text.props.font).toEqual({ family: 'Helvetica', size: 20, bold: false, italic: false, underline: false, overstrike: false });
    const box = h.find('box');
    expect(box.props.layout).toBe('grid');
    const layouts = h.ops('layout');
    expect(layouts.find((l) => l.id === 1).children).toEqual([{ id: text.id, align: null }, { id: box.id, align: 'left' }]);
    expect(layouts.find((l) => l.id === box.id)).toEqual({
      id: box.id, layout: 'grid', children: [{ id: h.find('pushbutton').id, align: null, grid: [0, 0, 1, 1] }, { id: h.find('pushbutton', 1).id, align: null, grid: [1, 2, 2, 1] }],
    });
    // the host ended the loop (null): the app is destroyed
    expect(h.cmds.at(-1)).toEqual(['destroy', { id: 1 }]);
  });

  it('runs commands for host events and reports the property changes', () => {
    const { h, output, error } = session(`
from guizero import *
app = App()
t = Text(app, text="0")
def add():
    t.value = int(t.value) + 1
b = PushButton(app, text="+1", command=add)
cb = CheckBox(app, text="ok", command=lambda: print("check", cb.value))
tb = TextBox(app, command=lambda key: print("typed", repr(key), tb.value))
s = Slider(app, command=lambda v: print("slider", repr(v)))
co = Combo(app, options=["a", "b"], command=lambda v: print("combo", v))
lb = ListBox(app, items=["x", "y", "z"], multiselect=True, command=lambda v: print("list", v))
bg = ButtonGroup(app, options=["r", "s"], command=lambda: print("group", bg.value))
app.display()
print("done", t.value)
`, steps(
      (w, h) => h.ev('command', h.find('pushbutton').id),
      (w, h) => h.ev('command', h.find('pushbutton').id),
      (w, h) => h.ev('command', h.find('checkbox').id),
      (w, h) => h.ev('change', h.find('textbox').id, 'ab'),
      (w, h) => h.ev('key', h.find('textbox').id, 'release', 'b', 'b', 56),
      (w, h) => h.ev('change', h.find('slider').id, 41.6),
      (w, h) => h.ev('change', h.find('combo').id, 1),
      (w, h) => h.ev('change', h.find('listbox').id, [2, 0]),
      (w, h) => h.ev('command', h.find('radiobutton', 1).id),
      (w, h) => h.ev('close', h.find('app').id),
    ));
    expect(error).toBeNull();
    expect(output).toBe("check 1\ntyped 'b' ab\nslider '42'\ncombo b\nlist ['x', 'z']\ngroup s\ndone 2\n");
    const sets = h.ops('set');
    expect(sets).toContainEqual({ id: h.find('text').id, props: { text: '2' } });
    expect(sets).toContainEqual({ id: h.find('checkbox').id, props: { value: 1 } });
    expect(sets).toContainEqual({ id: h.find('slider').id, props: { value: 42 } });
    expect(sets).toContainEqual({ id: h.find('buttongroup').id, props: { value: 's' } });
    expect(h.cmds.at(-1)).toEqual(['destroy', { id: 1 }]);
  });

  it('timers: after, repeat and cancel become host timers, fired with timer events', () => {
    const { h, output, error } = session(`
from guizero import App, Text
app = App()
n = [0]
def tick():
    n[0] += 1
    print("tick", n[0])
    if n[0] == 3:
        app.cancel(tick)
        app.after(10, app.destroy)
app.repeat(100, tick)
app.after(5000, print, ["never"])
app.cancel(print)
app.display()
print("end")
`, (w, h) => {
      // the host fires the timer that is due first
      const t = [...w.timers].sort((a, b) => a.due - b.due)[0];
      return t ? h.ev('timer', t.id) : null;
    });
    expect(error).toBeNull();
    expect(output).toBe('tick 1\ntick 2\ntick 3\nend\n');
    const after = h.ops('after');
    expect(after[0]).toEqual({ timer: 1, ms: 100 });
    expect(after[1]).toEqual({ timer: 2, ms: 5000 });
    expect(h.ops('cancel')).toContainEqual({ timer: 2 });
    expect(h.waits[0].timers.map((t) => t.id)).toEqual([1]);
  });

  it('a timer that was cancelled does nothing when it comes anyway', () => {
    const { output } = session(`
from guizero import App
app = App()
def hello():
    print("hello")
app.after(100, hello)
app.cancel(hello)
app.display()
print("end")
`, steps((w, h) => h.ev('timer', 1)));
    expect(output).toBe('end\n');
  });

  it('mouse and key events run the bindings of the widget and of its window, and tell the host what to report', () => {
    const { h, output } = session(`
from guizero import App, Drawing, Text
app = App()
d = Drawing(app)
t = Text(app, text="t")
d.when_mouse_moved = lambda e: print("moved", e.x, e.y, e.display_x)
d.when_double_clicked = lambda: print("double")
app.when_key_pressed = lambda e: print("key", repr(e.key), e.tk_event.keysym, e.widget)
t.when_key_released = lambda e: print("up", e.tk_event.keysym)
app.display()
`, steps(
      (w, h) => h.ev('mouse', h.find('drawing').id, 'motion', 3, 4, 103, 104),
      (w, h) => h.ev('mouse', h.find('drawing').id, 'double1', 3, 4),
      (w, h) => h.ev('key', h.find('text').id, 'press', 'q', 'q'),
      (w, h) => h.ev('key', h.find('text').id, 'release', '', 'Up'),
      (w, h) => h.ev('key', h.find('app').id, 'press', '', 'Left'),
    ));
    expect(output).toBe("moved 3 4 103\ndouble\nkey 'q' q [App] object\nup Up\nkey '' Left [App] object\n");
    expect(h.find('drawing').props.events).toEqual(['motion', 'double1']);
    expect(h.find('app').props.events).toEqual(['keypress']);
  });

  it('changing an event handler after display() sends the new event list', () => {
    const { h } = session(`
from guizero import App, Text
app = App()
t = Text(app, text="t")
app.after(1, lambda: setattr(t, "when_mouse_enters", print))
app.display()
`, (w, h) => (w.timers.length ? h.ev('timer', w.timers[0].id) : null));
    expect(h.ops('set')).toContainEqual({ id: h.find('text').id, props: { events: ['enter'] } });
  });

  it('destroy, hide and windows', () => {
    const { h, output } = session(`
from guizero import App, Window, Text, Box
app = App()
gone = Text(app, text="never shown")
gone.destroy()
box = Box(app)
t = Text(box, text="t")
other = Box(app)
w = Window(app, title="second")
def step():
    t.hide()
    other.destroy()
w.when_closed = lambda: print("window close asked")
app.after(1, step)
app.display()
print("visible", w.visible)
`, steps(
      (w, h) => h.ev('timer', w.timers[0].id),
      (w, h) => h.ev('close', h.find('window').id),
    ));
    expect(output).toBe('window close asked\nvisible True\n');
    expect(h.cmds.filter((c) => c[0] === 'create').map((c) => c[1].kind)).toEqual(['app', 'box', 'text', 'box', 'window']);
    expect(h.ops('layout').at(-1)).toEqual({ id: h.find('box').id, layout: 'auto', children: [] });
    expect(h.ops('destroy')).toEqual([{ id: h.find('box', 1).id }, { id: 1 }]); // the box, then the app when the host ends
    expect(h.find('window').parent).toBe(1);
  });

  it('a Window without when_closed is hidden when the host closes it', () => {
    const { h } = session(`
from guizero import App, Window
app = App()
w = Window(app)
app.display()
`, steps((w, h) => h.ev('close', h.find('window').id)));
    expect(h.ops('set')).toContainEqual({ id: h.find('window').id, props: { visible: false, modal: false } });
  });

  it('dialogs wait for the answer of the host', () => {
    const { output, h } = session(`
from guizero import App, info, yesno, question, select_color
app = App()
info("Title", "Some text")
print(yesno("Sure?", "Really?"))
print(question("Name", "Your name?", initial_value="Ann"))
print(app.question("Name", "Again?"))
print(select_color("red"))
`, steps(
      () => null,
      () => true,
      (w) => `${w.initial}!`,
      () => null,
      (w) => w.initial,
    ));
    expect(output).toBe('True\nAnn!\nNone\n#ff0000\n');
    expect(h.waits[0]).toEqual({ kind: 'forms-dialog', dialog: 'info', title: 'Title', text: 'Some text', initial: null });
  });

  it('update() handles the waiting events without blocking', () => {
    const { output, h } = session(`
from guizero import App, PushButton
app = App()
b = PushButton(app, command=lambda: print("pressed"))
for i in range(2):
    app.update()
    print("loop", i)
`, steps(
      (w, h) => h.ev('command', h.find('pushbutton').id),
      () => null,
      () => null,
    ));
    expect(output).toBe('pressed\nloop 0\nloop 1\n');
    expect(h.waits.every((w) => w.poll)).toBe(true);
    expect(h.ops('display')).toEqual([]);
  });

  it('waffle and drawing send their contents', () => {
    const { h } = session(`
from guizero import App, Waffle, Drawing
app = App()
w = Waffle(app, width=2, height=1, color="red")
w.set_pixel(1, 0, "blue")
d = Drawing(app, width=50, height=40)
d.rectangle(0, 0, 10, 10, color="green", outline=2)
def later():
    w.set_pixel(0, 0, (0, 0, 0))
    w[0, 0].dotty = True
    i = d.oval(1, 2, 3, 4)
    d.delete(i)
    d.clear()
    w.width = 1
app.after(1, later)
app.display()
`, steps((w, h) => h.ev('timer', w.timers[0].id)));
    const waffle = h.find('waffle');
    expect(waffle.props).toMatchObject({ width: 2, height: 1, dim: 20, pad: 5, pixels: [[['#ff0000', false], ['#0000ff', false]]] });
    const drawing = h.find('drawing');
    expect(drawing.props.shapes).toEqual([{ type: 'rectangle', coords: [0, 0, 10, 10], color: '#008000', outline: 2, outline_color: '#000000', id: 1 }]);
    expect(h.ops('set')).toContainEqual({ id: waffle.id, props: { pixel: [0, 0, '#000000', false] } });
    expect(h.ops('set')).toContainEqual({ id: waffle.id, props: { pixel: [0, 0, '#000000', true] } });
    expect(h.ops('draw')).toEqual([{ id: drawing.id, shape: { type: 'oval', coords: [1, 2, 3, 4], color: '#000000', outline: 0, outline_color: null, id: 2 } }]);
    expect(h.ops('undraw')).toEqual([{ id: drawing.id, shape: 2 }]);
    expect(h.ops('clear')).toEqual([{ id: drawing.id }]);
    expect(h.ops('set').find((s) => s.id === waffle.id && s.props.pixels)?.props.pixels).toEqual([[['#000000', true]]]);
  });

  it('pictures ask the host for the image size', () => {
    const { h, output, error } = session(`
from guizero import App, Picture, PushButton
app = App()
p = Picture(app, image="cat.png")
print(p.value, p.width, p.height)
b = PushButton(app, image="cat.png", width=20)
print(repr(b.text), b.width, b.height)
try:
    Picture(app, image="dog.png")
except Exception as e:
    print(type(e).__name__)
`, () => null, { images: { 'cat.png': { width: 40, height: 30 } } });
    expect(error).toBeNull();
    expect(output).toBe("cat.png 40 30\n'' 20 30\nGUIZeroException\n");
    expect(new Set(h.ops('image').map((d) => d.path))).toEqual(new Set(['cat.png', 'dog.png']));
  });

  it('a menu bar belongs to its window and runs the chosen command', () => {
    const { h, output } = session(`
from guizero import App, MenuBar
app = App()
m = MenuBar(app, toplevel=["File", "Edit"], options=[[["Open", lambda: print("open")]], [["Cut", lambda: print("cut")]]])
app.display()
`, steps((w, h) => h.ev('menu', h.find('menubar').id, 1, 0)));
    expect(output).toBe('cut\n');
    expect(h.find('menubar')).toMatchObject({ parent: 1, props: { toplevel: ['File', 'Edit'], options: [['Open'], ['Cut']] } });
    expect(h.ops('layout').find((l) => l.id === 1).children).toEqual([]);
  });

  it('an error in a callback ends the program with that error', () => {
    const { error } = session(`
from guizero import App, PushButton
app = App()
PushButton(app, command=lambda: 1 / 0)
app.display()
`, steps((w, h) => h.ev('command', h.find('pushbutton').id)));
    expect(error.kind).toBe('ZeroDivisionError');
  });

  it('headless runs (runToEnd) fire timers on the virtual clock and end when none are left', async () => {
    const { runToEnd } = await import('../src/index.js');
    const r = runToEnd('from guizero import App\nimport time\napp = App()\napp.after(1500, print, ["late"])\napp.after(500, print, ["early"])\napp.display()\nprint(time.time() >= 0)\n');
    expect(r.error).toBeNull();
    expect(r.output).toBe('early\nlate\nTrue\n');
    expect(r.vm.virtualMs).toBe(1500);
  });
});
