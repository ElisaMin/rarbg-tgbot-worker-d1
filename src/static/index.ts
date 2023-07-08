import { Language } from '../misc/lang';

const html = (content:string)=> `<!DOCTYPE html><html lang="en">${content}</html>`
const head = (content:string) => `<head><meta charset="UTF-8"><title>Search Generator</title><meta name="viewport" content="width=device-width, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no" />${content}</head>`
const script = (content:string="") => `<script>${content}</script>`
const scriptSrc = (url:string="") => `<script src="${url}"></script>`
const body = (content:string) => `<body>${content}</body>`
function langScript(lang:Language) {
   return `const lang = ${JSON.stringify({...lang.webappJson,...lang.keywords})};const getKeywordOf = (id) =>` + `lang[id]`
}
function parseKeys(lang:Language) {
   let keys = lang.keywords
   let keysContent = ""
   for (let key in keys) {
      keysContent += `"${key}",`
   }
   return keysContent
}
export function webAppIndexContent(lang:Language=Language.current) {
   let headContent = ""
   headContent+=scriptSrc("https://telegram.org/js/telegram-web-app.js")
   headContent+=script(
// language=JavaScript
`
let updateScheme = ()=> {
  let webapp = window.Telegram.WebApp
  let style = document.body.style
  style.colorScheme = webapp.colorScheme;
  style.background = webapp.backgroundColor
  style.color = webapp.themeParams.text_color
}
let closeWindow = (sth)=> {
  if(sth) alert(sth)
}
const app = Telegram.WebApp
if (!app) {
  closeWindow("Telegram not found")
}
let btn = app.MainButton
if (!btn) closeWindow("MainButton not found")
btn.text = "SEND"
app.onEvent('themeChanged', updateScheme)

app.onEvent("mainButtonClicked", () => {
  console.log("mainButtonClicked")
  let text = document.querySelector('textarea').value
  if (!text || text === "" || text.length < 4) {
    alert("content is empty")
  } else {
    try {
      window.Telegram.WebApp.sendData(text)
      // closeWindow()
    } catch (error) {
      console.error(error)
      let err = error.stack || error.message || error.toString();
      alert("error!but you can copy the content and send it to me!${'\\'}n错误!但你可以复制内容并发送给我!${'\\'}n" + err)
    }
  }
})
function generating(lang) {
  let d = document;
  let tag = (tag,obj) => {
    let t = d.createElement(tag)
    for (let i in obj) { t[i] = obj[i]}
    return t
  }
  let s = tag("section")
  s.appendChild(tag("h1",{innerText:lang.title}))
  s.appendChild(tag("textarea",{placeholder:lang.inTarget,readOnly:true,disabled:true}))
  let div = s.appendChild(tag("div"))
  for (const field of [${parseKeys(lang)}]) {
    div.appendChild(tag("input",{ type:(field === "year"||field==='page') ? "number" : "text",id:field,placeholder:lang[field]??"by "+field}))
  }
  // div.appendChild(tag("button",{innerText:lang.send}))
  window.addEventListener("load",()=>{
    d.body.appendChild(s);
    addEventListener("input",ev => {
      const target = document.querySelector('textarea');
      if (ev.target.tagName !== "INPUT") {
        if (target.value.trim().length>1) {
          window.Telegram.WebApp.MainButton.show()
        } else {
          window.Telegram.WebApp.MainButton.hide()
        }
        return;
      }
      let targetText="";
      for (const elm of document.querySelectorAll('input')) {
        let v = elm.value
        if (!v || v === "") {
          elm.value = ""
          continue
        }
        let keyword = getKeywordOf(elm.id)
        targetText += "#"+keyword+" "+v+" "
      }
      if (targetText.trim().length>1) {
        window.Telegram.WebApp.MainButton.show()
      } else {
        window.Telegram.WebApp.MainButton.hide()
      }
      targetText = "/keyword " + targetText
      target.value = targetText
    });
    updateScheme()
    app.ready()
  })
}
${langScript(lang)}
if (lang) {
  generating(lang)
} else {
  closeWindow("lang not found")
}
`)

   headContent+=`<style>*{box-sizing: border-box;}section {display: block;}div,textarea {margin: .2rem;width: 100%;border: 0;padding: .3rem;background-color:var(--tg-theme-secondary-bg-color,#232e3c)}  input {margin: .3rem .7%;width: 48.5%;border: 0;padding: .3rem;background-color:var(--tg-theme-secondary-bg-color,#232e3c)}</style>`
   headContent+=body("")
   return html(head(headContent))
}