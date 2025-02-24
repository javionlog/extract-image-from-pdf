import './style.css'
import * as pdfjs from 'pdfjs-dist'
pdfjs.GlobalWorkerOptions.workerSrc = './node_modules/pdfjs-dist/build/pdf.worker.mjs'

document.querySelector('#app').innerHTML = `
<input id="file" type="file" />
`

document.querySelector('#file').addEventListener('change', e => {
  const file = e.target.files[0]
  converter(file)
})

const encodeHtml = html => {
  let tmpEl = document.createElement('div')
  tmpEl.textContent = html
  const result = tmpEl.innerHTML
  tmpEl = null
  return result
}

const converter = file => {
  if (file) {
    const reader = new FileReader()
    reader.readAsArrayBuffer(file)
    reader.onload = function (e) {
      const buffer = e.target.result
      const typedArray = new Uint8Array(buffer)
      const loadingTask = pdfjs.getDocument(typedArray)
      loadingTask.promise.then(async doc => {
        let textResult = ''
        let imgResult = ''
        for (let i = 1; i <= doc.numPages; i++) {
          // 处理文本
          let tmpList = []
          const textList = await getTextList(doc, i)
          for (let i = 0, j = 0; i < textList.items.length; i++) {
            if (textList.items[i].hasEOL) {
              tmpList.push(textList.items.slice(j, i).map(item => item.str))
              j = i
            }
          }
          textResult += tmpList
            .map(item => {
              return `<div>${encodeHtml(item.join(''))}</div>`
            })
            .join('')

          // 处理图片
          const imgList = await getImageList(doc, i)
          for (const url of imgList) {
            imgResult += `<div><img max-width="100%" src="${encodeHtml(url)}" /></div>`
          }
        }
        document.querySelector('#text-containter').innerHTML = textResult
        document.querySelector('#img-containter').innerHTML = imgResult
      })
    }
  }
}

const getTextList = async (doc, pageNum) => {
  const page = await doc.getPage(pageNum)
  const text = await page.getTextContent()
  return text
}

const getImageList = async (doc, pageNum) => {
  let imgList = []
  const page = await doc.getPage(pageNum)
  const operators = await page.getOperatorList()
  const rawImgOperatorList = operators.fnArray
    .map((f, i) => {
      return f === pdfjs.OPS.paintImageXObject ? i : null
    })
    .filter(n => n !== null)
  for (const operator of rawImgOperatorList) {
    const filename = operators.argsArray[operator][0]
    await new Promise(resolve => {
      page.objs.get(filename, async arg => {
        const bitmap = arg.bitmap
        const width = bitmap.width
        const height = bitmap.height
        const canvas = new OffscreenCanvas(width, height)
        const ctx = canvas.getContext('bitmaprenderer')
        ctx.transferFromImageBitmap(bitmap)
        const blob = await canvas.convertToBlob()
        const url = URL.createObjectURL(blob)
        imgList.push(url)
        resolve()
      })
    })
  }
  return imgList
}
