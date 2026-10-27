/** Wechselt die Route, z. B. navigate('plans/template/<id>'). */
export function navigate(path) {
  location.hash = `#/${path}`;
}
