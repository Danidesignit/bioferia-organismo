/* =========================================================================
   Nombres de los pulsos: opcionales, cortos y sin malas palabras.
   Se usa en el celular (para avisar) y en el servidor (para que nadie lo saltee).
   Names.clean('  Dani ') → { name: 'Dani', rejected: false }
   ========================================================================= */
(function (root) {
  const MAX = 12;
  // malas palabras (español rioplatense + inglés), ya normalizadas: sin tildes, en minúscula
  const BAD = [
    'puta', 'puto', 'puton', 'prostitut', 'mierda', 'concha', 'conchud', 'pija', 'pijud', 'verga', 'choto', 'chota',
    'culo', 'culiad', 'culiao', 'cagar', 'cagon', 'forro', 'forra', 'boludo', 'boluda', 'pelotud', 'trolo', 'trola',
    'mogolic', 'tarad', 'idiota', 'imbecil', 'estupid', 'garcha', 'coger', 'cogid', 'poronga', 'sorete', 'orto',
    'petera', 'chupala', 'chupame', 'mamada', 'pajer', 'paja', 'hdp', 'lpm', 'lpqtp', 'ptm', 'nazi', 'hitler',
    'fuck', 'shit', 'bitch', 'dick', 'cock', 'pussy', 'cunt', 'whore', 'slut', 'nigg', 'negrode', 'porno', 'sexo',
  ];
  // pasa a una forma comparable: sin tildes, sin símbolos, letras repetidas juntas y números "disfrazados"
  function normalize(s) {
    return s.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[0@4]/g, (c) => ({ 0: 'o', '@': 'a', 4: 'a' }[c]))
      .replace(/1/g, 'i').replace(/3/g, 'e').replace(/5/g, 's').replace(/7/g, 't')
      .replace(/[^a-zñ]/g, '')
      .replace(/(.)\1+/g, '$1');
  }
  function clean(input) {
    let name = String(input || '')
      .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ ]/g, '')     // solo letras y espacios
      .replace(/\s+/g, ' ').trim().slice(0, MAX).trim();
    // se revisa el texto original (con números "disfrazados") y el nombre ya limpio
    const raw = normalize(String(input || '')), n = normalize(name);
    if (BAD.some((w) => { const b = normalize(w); return raw.includes(b) || n.includes(b); })) return { name: '', rejected: true };
    if (!name) return { name: '', rejected: false };
    return { name, rejected: false };
  }
  const Names = { clean, MAX };
  if (typeof module !== 'undefined' && module.exports) module.exports = Names;
  else root.Names = Names;
})(typeof window !== 'undefined' ? window : globalThis);
