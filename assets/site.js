// Renders one card per entry in games.js.
(function () {
  var list = document.getElementById('games');
  var games = window.MINI_GAMES || [];
  games.forEach(function (game) {
    var li = document.createElement('li');
    li.className = 'card';

    var link = document.createElement('a');
    link.className = 'cover';
    link.href = game.path;
    link.setAttribute('aria-label', 'Play ' + game.name);
    link.tabIndex = -1;
    var img = document.createElement('img');
    img.src = game.image;
    img.alt = game.imageAlt || '';
    img.loading = 'lazy';
    img.width = 1200;
    img.height = 675;
    link.appendChild(img);

    var body = document.createElement('div');
    body.className = 'body';
    var h = document.createElement('h3');
    h.textContent = game.name;
    var p = document.createElement('p');
    p.textContent = game.description;
    body.appendChild(h);
    body.appendChild(p);
    if (game.tags && game.tags.length) {
      var tags = document.createElement('ul');
      tags.className = 'tags';
      game.tags.forEach(function (t) {
        var tag = document.createElement('li');
        tag.textContent = t;
        tags.appendChild(tag);
      });
      body.appendChild(tags);
    }
    var play = document.createElement('a');
    play.className = 'play';
    play.href = game.path;
    play.textContent = 'Play';
    play.setAttribute('aria-label', 'Play ' + game.name);
    body.appendChild(play);

    li.appendChild(link);
    li.appendChild(body);
    list.appendChild(li);
  });
})();
