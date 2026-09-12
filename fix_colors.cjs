const fs = require('fs');

let css = fs.readFileSync('src/index.css', 'utf-8');

// Replace wrong colors in specific selectors
css = css.replace('.product-price { margin-top: 12px; color: #f4ebe3;', '.product-price { margin-top: 12px; color: #3b291f;');
css = css.replace('.line-total { color: #f4ebe3;', '.line-total { color: #443027;');
css = css.replace('color: #f4ebe3; background: #fcfaf7; font-size: 12px; }', 'color: #5d4a3e; background: #fcfaf7; font-size: 12px; }'); // note-area
css = css.replace('.outline-action { border: 1px solid #dfd5cc; color: #f4ebe3; background: #fcfaf7; }', '.outline-action { border: 1px solid #dfd5cc; color: #654f40; background: #fcfaf7; }');
css = css.replace('.solid-action { border: 0; color: #fcfaf7; background: #f4ebe3; }', '.solid-action { border: 0; color: #fffdf9; background: #3b2b21; }');
css = css.replace('.adisyon-sheet { margin: 20px 24px; padding: 20px; border: 1px solid #dfd5cc; border-radius: 16px; color: #f4ebe3;', '.adisyon-sheet { margin: 20px 24px; padding: 20px; border: 1px solid #dfd5cc; border-radius: 16px; color: #4a372c;');
css = css.replace('.adisyon-item strong { color: #f4ebe3;', '.adisyon-item strong { color: #4b372b;');
css = css.replace('.adisyon-total b { color: #f4ebe3;', '.adisyon-total b { color: #5b483c;');
css = css.replace('.adisyon-grand { align-items: baseline; padding-top: 14px; color: #f4ebe3;', '.adisyon-grand { align-items: baseline; padding-top: 14px; color: #3b291f;');
css = css.replace('.summary-card h3 { margin: 0; color: #f4ebe3;', '.summary-card h3 { margin: 0; color: #4b382d;');

// also fix inactive category buttons in left panel
// in screenshot "Tümü" is dark brown bg `#5c493d` with white text.
// inactive category buttons have `#fcfaf7` text on `#f4ebe3` or similar...
// actually, original .category-button was:
// .category-button { ... color: #79695e; background: #fffdfa; }
// let's check its current state:
css = css.replace('.category-button { min-height: 42px; padding: 0 14px; border: 1px solid #302722; border-radius: 12px; color: #a89a8f; background: #1f1a18; font-size: 12px; font-weight: 750; white-space: nowrap; transition: .18s ease; }', '.category-button { min-height: 42px; padding: 0 14px; border: 1px solid #ebe3dc; border-radius: 12px; color: #79695e; background: #fffdfa; font-size: 12px; font-weight: 750; white-space: nowrap; transition: .18s ease; }');
css = css.replace('.category-button:hover { border-color: #4a3c35; background: #2e241f; }', '.category-button:hover { border-color: #d4b79f; background: #fff7f0; }');
css = css.replace('.category-button.selected { color: #141110; border-color: #c99b7b; background: #c99b7b; box-shadow: 0 7px 15px rgba(201,155,123,.3); }', '.category-button.selected { color: #fffaf7; border-color: #473126; background: #473126; box-shadow: 0 7px 15px rgba(71,49,38,.16); }');

// wait, is there any other wrong color?
// .product-card text color?
// In the screenshot, "Espresso" is #5c493d, which is correct.
// "Tak shot - 60 ml" is grayish, correct.
// "Çok Satan" badge text is #fcfaf7 on #f4ebe3. This is wrong. It should be #81552d on #fbebd5!
css = css.replace('.product-badge { position: absolute; top: 12px; right: 12px; padding: 4px 7px; border-radius: 7px; color: #fcfaf7; background: #f4ebe3;', '.product-badge { position: absolute; top: 12px; right: 12px; padding: 4px 7px; border-radius: 7px; color: #81552d; background: #fbebd5;');

// The search input text:
// .search-box input { ... color: #f2e9e4; } which is light! It should be dark!
css = css.replace('.search-box input { width: 100%; border: 0; outline: 0; color: #f2e9e4; background: transparent; font-size: 14px; }', '.search-box input { width: 100%; border: 0; outline: 0; color: #3c2c23; background: transparent; font-size: 14px; }');
css = css.replace('.search-box input::placeholder { color: #7d7066; }', '.search-box input::placeholder { color: #b0a197; }');
css = css.replace('.search-box { display: flex; align-items: center; gap: 10px; height: 52px; margin: 22px 0 15px; padding: 0 14px; border: 1px solid #dfd5cc; border-radius: 15px; color: #958075; background: #fcfaf7; transition: .2s ease; }', '.search-box { display: flex; align-items: center; gap: 10px; height: 52px; margin: 22px 0 15px; padding: 0 14px; border: 1px solid #e9e1d8; border-radius: 15px; color: #958075; background: #fbfaf7; transition: .2s ease; }');

// .quantity-number color
css = css.replace('.quantity-number { min-width: 22px; color: #5c493d; text-align: center; font-size: 12px; font-weight: 800; }', '.quantity-number { min-width: 22px; color: #544238; text-align: center; font-size: 12px; font-weight: 800; }');

// grand total strong
css = css.replace('.grand-total { display: flex; align-items: baseline; justify-content: space-between; padding-top: 13px; border-top: 1px dashed #dfd5cc; color: #5c493d; }', '.grand-total { display: flex; align-items: baseline; justify-content: space-between; padding-top: 13px; border-top: 1px dashed #dfd4ca; color: #392820; }');

fs.writeFileSync('src/index.css', css, 'utf-8');
console.log('Fixed CSS specific issues');
