// App de démonstration qa-mesh-next (TodoMVC simplifié, code original).
// Contient des défauts PLANTÉS pour démontrer /qa-explore puis /qa-bugbash :
// voir PLANTED_BUGS.md (à ne pas donner aux explorateurs).
const KEY = 'qa-mesh-demo-todos';
let todos = JSON.parse(localStorage.getItem(KEY) || '[]');
const $ = (s) => document.querySelector(s);

function save() { localStorage.setItem(KEY, JSON.stringify(todos)); }
function filter() { return (location.hash.replace('#/', '') || 'all'); }

function render() {
  const list = $('.todo-list');
  list.innerHTML = '';
  const f = filter();
  todos
    .filter((t) => f === 'all' || (f === 'active' ? !t.done : t.done))
    .forEach((t) => {
      const li = document.createElement('li');
      li.className = t.done ? 'completed' : '';
      li.setAttribute('data-testid', 'todo-item');
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = t.done;
      box.setAttribute('aria-label', `Toggle ${t.title}`);
      box.addEventListener('change', () => { t.done = box.checked; save(); render(); });
      const label = document.createElement('label');
      label.textContent = t.title;
      const del = document.createElement('button');
      del.textContent = '×';
      del.setAttribute('aria-label', `Delete ${t.title}`);
      del.addEventListener('click', () => { todos = todos.filter((x) => x !== t); save(); render(); });
      li.append(box, label, del);
      list.append(li);
    });
  // DÉFAUT PLANTÉ n°1 : le compteur compte toutes les tâches, terminées comprises.
  const left = todos.length;
  $('[data-testid="todo-count"]').textContent = `${left} ${left === 1 ? 'item' : 'items'} left`;
  $('footer').classList.toggle('hidden', todos.length === 0);
  document.querySelectorAll('footer nav a').forEach((a) => a.classList.toggle('selected', a.dataset.filter === f));
}

$('.new-todo').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  // DÉFAUT PLANTÉ n°2 : une saisie faite uniquement d'espaces crée une tâche vide.
  const title = e.target.value;
  if (title === '') return;
  todos.push({ title: title.trim(), done: false });
  e.target.value = '';
  save();
  render();
});
$('.clear-completed').addEventListener('click', () => { todos = todos.filter((t) => !t.done); save(); render(); });
window.addEventListener('hashchange', render);
render();
