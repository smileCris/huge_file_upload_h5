// 使用 http 模块搭建服务端
const http = require('http')
const path = require('path')
const fse = require("fs-extra")
// 使用 multiparty 包解析 FormData 数据
const multiparty = require('multiparty')

const server = http.createServer()
const UPLOAD_DIR = path.resolve(__dirname, '..', 'target') // 大文件存储目录

const resolvePost = req =>
  new Promise(resolve => {
    let chunk = ''
    req.on('data', data => {
      chunk += data
    })
    req.on('end', () => {
      resolve(JSON.parse(chunk))
    })
  })

// 去除文件后缀
const getFileName = (filePath) => {
  return filePath.slice(0, filePath.lastIndexOf('.') - 1)
}

// 合并切片
const mergeFileChunk = async (filePath, filename) => {
  // 文件夹名不带上传文件后缀名，以防合成切片时与新建的空文件名冲突
  const chunkDir = getFileName(`${UPLOAD_DIR}/${filename}`)
  const chunkPaths = await fse.readdir(chunkDir)
  // 创建一个空文件
  await fse.readdir(chunkDir)
  await fse.writeFile(filePath, '')
  chunkPaths.forEach(chunkPath => {
    // 从切片文件夹中讲切片合并到空文件中
    fse.appendFileSync(filePath, fse.readFileSync(`${chunkDir}/${chunkPath}`))
    fse.unlinkSync(`${chunkDir}/${chunkPath}`)
  })
  fse.rmdirSync(chunkDir) // 合并完毕后删除保存切片的目录
}

server.on('request', async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', '*')
  if (req.method === 'OPTIONS') {
    res.status = 200
    res.end()
    return
  }

  if (req.url === '/merge') {
    const data = await resolvePost(req)
    const { filename } = data
    const filePath = `${UPLOAD_DIR}/${filename}`
    await mergeFileChunk(filePath, filename).catch(err => console.log(err))
    res.end(
      JSON.stringify({
        code: 0,
        message: 'file merged sucess'
      })
    )
  }

  const multipart = new multiparty.Form()

  multipart.parse(req, async (err, filelds, files) => {
    if (err) return
    const [chunk] = files.chunk
    const [hash] = filelds.hash
    const [filename] = filelds.filename
    // 文件夹名不带上传文件后缀名，以防合成切片时与新建的空文件名冲突
    const chunkDir = getFileName(`${UPLOAD_DIR}/${filename}`)

    // 切片目录不存在，创建切片目录
    if (!fse.existsSync(chunkDir)) {
      await fse.mkdirs(chunkDir)
    }

    // fs-extra 专用方法，类似 fs.rename 并且跨平台
    // fs-extra 的 rename 方法 windows 平台会有权限问题
    await fse.move(chunk.path, `${chunkDir}/${hash}`)
    res.end('received file chunk')
  })
})

server.listen(3000, () => console.log('正在监听 3000 端口'))