import './style.css'
const pdfjs = await import('pdfjs-dist/build/pdf')
const pdfjsWorker = await import('pdfjs-dist/build/pdf.worker.entry')
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker

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

const getTextList = (doc, pageNum) => {
  return new Promise(async resolve => {
    const page = await doc.getPage(pageNum)
    const text = await page.getTextContent()
    resolve(text)
  })
}

const getImageList = (doc, pageNum) => {
  let imgList = []
  return new Promise(async resolve => {
    const page = await doc.getPage(pageNum)
    const operators = await page.getOperatorList()
    const rawImgOperatorList = operators.fnArray
      .map((f, i) => {
        return f === pdfjs.OPS.paintImageXObject ? i : null
      })
      .filter(n => n !== null)
    for (const operator of rawImgOperatorList) {
      const filename = operators.argsArray[operator][0]
      page.objs.get(filename, async arg => {
        const canvas = document.createElement('canvas')
        canvas.width = arg.width
        canvas.height = arg.height
        const ctx = canvas.getContext('2d')
        const typedArray = new Uint8ClampedArray(arg.width * arg.height * 4)
        let k = 0
        let i = 0
        while (i < arg.data.length) {
          typedArray[k] = arg.data[i] // r
          typedArray[k + 1] = arg.data[i + 1] // g
          typedArray[k + 2] = arg.data[i + 2] // b
          typedArray[k + 3] = 255 // a

          i += 3
          k += 4
        }
        const imgData = ctx.createImageData(arg.width, arg.height)
        imgData.data.set(typedArray)
        ctx.putImageData(imgData, 0, 0)
        const url = canvas.toDataURL('image/png', 1)
        imgList.push(url)
      })
    }
    resolve(imgList)
  })
}
