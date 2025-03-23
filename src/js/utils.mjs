export async function renderWithTemplate(
  templateFn,
  parentElement,
  data,
  callback,
  position = 'afterbegin',
  clear = true,
) {
  if (clear) {
    parentElement.innerHTML = '';
  }
  const htmlString = await templateFn(data);
  parentElement.insertAdjacentHTML(position, htmlString);
  if (callback) {
    callback(data);
  }
}

function loadTemplate(path) {
  // currying
  return async function () {
    const res = await fetch(path);
    if (res.ok) {
      const html = await res.text();
      return html;
    }
  };
}

export async function loadHeaderFooter() {
  const headerTemplateFn = loadTemplate('/partials/header.html');
  const footerTemplateFn = loadTemplate('/partials/footer.html');
  const headerHTML = document.querySelector('#main-header');
  const footerHTML = document.querySelector('#main-footer');
  renderWithTemplate(headerTemplateFn, headerHTML);
  renderWithTemplate(footerTemplateFn, footerHTML);
}
