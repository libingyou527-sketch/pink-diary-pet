window.__ModuleLoader__.load({
  id: 'dsh-pet-memory-viewer',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'dsh-pet-memory-viewer'
    const PANEL_ID = 'dsh-pet-memory'
    const ROUTE = '/dsh-pet-memory'
    const PET_CHAT_ROUTE = '/dsh-pet-7340/chat?pet=main&surface=any'
    const MEMORY_HINT = '~/.dsh/dsh-pet/memory.json'
    const MAX_TEXT = 2000

    const zh = {
      panel: '记忆',
      title: '絮的记忆',
      subtitle: 'dsh-pet · memory.json',
      refresh: '刷新',
      refreshing: '刷新中…',
      older: '加载更早的记录',
      updated: '更新于',
      count: '条对话',
      empty: '记忆里还没有对话，先和絮说句话吧。',
      missing: '找不到 memory.json',
      failed: '读取失败',
      raw: '原始 JSON',
      you: '你',
      assistant: '絮',
      system: '系统',
      placeholder: '对絮说点什么…（Enter 发送，Shift+Enter 换行）',
      send: '发送',
      typing: '絮正在输入…',
      tooLong: '消息过长（限 2000 字）',
    }

    const en = {
      panel: 'Memory',
      title: "Xu's memory",
      subtitle: 'dsh-pet · memory.json',
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      older: 'Load older messages',
      updated: 'Updated',
      count: 'messages',
      empty: 'Nothing remembered yet — say hello to Xu below.',
      missing: 'memory.json not found',
      failed: 'Could not read memory.json',
      raw: 'Raw JSON',
      you: 'You',
      assistant: 'Xu',
      system: 'System',
      placeholder: 'Say something to Xu… (Enter to send, Shift+Enter for a new line)',
      send: 'Send',
      typing: 'Xu is typing…',
      tooLong: 'Message is too long (2000 characters max)',
    }

    async function readMemory() {
      const response = await fetch(ROUTE + '?t=' + Date.now(), {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      })
      if (!response.ok) throw new Error('HTTP ' + response.status)
      return response.json()
    }

    const RVC_VOICE = {
      baseUrl: 'http://127.0.0.1:4892',
      model: 'E:\\edge File\\download\\%E6%98%94%E6%B6%9F%20%281%29.pth',
      index: '',
      baseVoice: 'zh-CN-XiaoxuanNeural',
      f0Method: 'rmvpe',
      indexRate: 0,
    }

    async function speakText(text) {
      const value = String(text || '').trim()
      if (!value) return
      try {
        const response = await fetch('/dsh-tts-api/speak', {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/json' },
          body: JSON.stringify({ text: value, provider: 'rvc', voice: RVC_VOICE.baseVoice, custom: RVC_VOICE }),
          signal: AbortSignal.timeout(10000),
        })
        console.log('[memory-tts] speak status=' + response.status)
        if (!response.ok) return
        const data = await response.json().catch(() => null)
        if (!data || typeof data.url !== 'string') return
        const audio = new Audio(data.url)
        try {
          await audio.play()
          console.log('[memory-tts] playing ' + data.url)
        } catch (error) {
          console.warn('[memory-tts] play blocked', error)
          window.alert('语音已生成，但浏览器拦截了自动播放。请再点一次消息旁的 🔊 按钮。')
        }
      } catch (error) {
        console.warn('[memory-tts] speak failed', error)
      }
    }

    async function sendToPet(text, images = [], videos = []) {
      const body = { text }
      if (Array.isArray(images) && images.length > 0) body.images = images
      if (Array.isArray(videos) && videos.length > 0) body.videos = videos
      const response = await fetch(PET_CHAT_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || result === null || result.ok !== true) {
        throw new Error((result && (result.message || result.reason)) || 'HTTP ' + response.status)
      }
      return result
    }

    function readImageFile(file) {
      return new Promise((resolve, reject) => {
        if (!file || (file.type && !String(file.type).startsWith('image/'))) {
          reject(new Error('不是图片文件'))
          return
        }
        if (file.size > 12 * 1024 * 1024) {
          reject(new Error('图片超过 12MB'))
          return
        }
        const reader = new FileReader()
        reader.onload = () => {
          const dataUrl = String(reader.result || '')
          resolve({
            name: file.name || 'image',
            mime: file.type || 'image/png',
            data: dataUrl.replace(/^data:[^;]+;base64,/, ''),
            dataUrl,
          })
        }
        reader.onerror = () => reject(new Error('读取图片失败'))
        reader.readAsDataURL(file)
      })
    }

    function readVideoFile(file) {
      return new Promise((resolve, reject) => {
        let path = String(file?.path ?? '')
        if (!path && typeof window.__DSH_HOST_PATHS__?.pathFor === 'function') {
          try { path = String(window.__DSH_HOST_PATHS__.pathFor(file) || '') } catch {}
        }
        if (!path) {
          reject(new Error('本地视频拖拽仅桌面版支持'))
          return
        }
        if (!/\.(mp4|mov|mkv|webm)$/i.test(String(file.name ?? ''))) {
          reject(new Error('仅支持本地视频文件'))
          return
        }
        resolve({ name: file.name || 'video.mp4', path })
      })
    }

    function formatTime(value) {
      if (typeof value !== 'number' || !Number.isFinite(value)) return ''
      try {
        return new Date(value).toLocaleString('zh-CN', {
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      } catch {
        return ''
      }
    }

    function textOf(value) {
      if (typeof value === 'string') return value
      if (value === null || value === undefined) return ''
      if (Array.isArray(value)) {
        return value
          .map((part) => {
            if (typeof part === 'string') return part
            if (part && typeof part.text === 'string') return part.text
            return JSON.stringify(part)
          })
          .join('\n')
      }
      if (typeof value === 'object') {
        return typeof value.text === 'string' ? value.text : JSON.stringify(value, null, 2)
      }
      return String(value)
    }

    /** Find the chat rows dsh-pet stores, without depending on one exact nesting. */
    function collectMessages(payload) {
      const data = payload && payload.data
      if (!data) return []
      const direct = data.main && data.main.main && data.main.main.messages
      if (Array.isArray(direct)) return direct
      if (Array.isArray(data.messages)) return data.messages
      const found = []
      const seen = new Set()
      const walk = (value) => {
        if (!value || typeof value !== 'object' || seen.has(value)) return
        seen.add(value)
        if (Array.isArray(value)) {
          value.forEach(walk)
          return
        }
        if (typeof value.content === 'string' || Array.isArray(value.content)) {
          found.push(value)
          return
        }
        Object.keys(value).forEach((key) => walk(value[key]))
      }
      walk(data)
      if (found.length === 0 && typeof data.content === 'string') {
        found.push({ role: 'memory', content: data.content })
      }
      return found
    }

    function roleLabel(t, role) {
      if (role === 'user') return t('you')
      if (role === 'assistant') return t('assistant')
      if (role === 'system') return t('system')
      return role || t('system')
    }

    function ImageBubble({ image }) {
      const [src, setSrc] = React.useState(null)
      const [failed, setFailed] = React.useState(false)
      const [visible, setVisible] = React.useState(false)
      const holderRef = React.useRef(null)

      React.useEffect(() => {
        if (!image || typeof image.file !== 'string') {
          setFailed(true)
          return () => {}
        }
        const node = holderRef.current
        if (!node || typeof IntersectionObserver === 'undefined') {
          setVisible(true)
          return () => {}
        }
        const observer = new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              setVisible(true)
              observer.disconnect()
            }
          },
          { rootMargin: '240px' },
        )
        observer.observe(node)
        return () => observer.disconnect()
      }, [image])

      React.useEffect(() => {
        if (!visible) return
        let alive = true
        if (!image || typeof image.file !== 'string') {
          setFailed(true)
          return () => {}
        }
        fetch('/dsh-pet-7340/media?file=' + encodeURIComponent(image.file) + '&thumb=1', {
          cache: 'no-store',
          headers: { accept: 'application/json' },
        })
          .then((response) => response.json())
          .then((result) => {
            if (!alive) return
            if (result && result.ok && typeof result.dataUrl === 'string') setSrc(result.dataUrl)
            else setFailed(true)
          })
          .catch(() => {
            if (alive) setFailed(true)
          })
        return () => {
          alive = false
        }
      }, [visible, image])

      if (failed) {
        return h('div', { ref: holderRef, style: { fontSize: 12, opacity: 0.55, marginTop: 6 } }, '[图片加载失败]')
      }
      if (!src) {
        return h('div', { ref: holderRef, style: { fontSize: 12, opacity: 0.55, marginTop: 6 } }, '图片加载中…')
      }
      return h('img', {
        ref: holderRef,
        src,
        alt: image.description || '图片',
        loading: 'lazy',
        style: {
          display: 'block',
          maxWidth: '100%',
          maxHeight: 240,
          borderRadius: 10,
          marginTop: 6,
          objectFit: 'contain',
          background: 'rgba(127,127,127,0.06)',
        },
      })
    }

    function MessageRow({ t, message }) {
      const isUser = message.role === 'user'
      const isSystem = message.role === 'system'
      const time = formatTime(message.ts)
      const images = Array.isArray(message.images) ? message.images.filter((image) => image && typeof image.file === 'string') : []
      const sourceLabel = message.source === 'qq' ? 'QQ' : message.source === 'local' ? '本地' : ''
      return h(
        'div',
        {
          style: {
            display: 'flex',
            justifyContent: isSystem ? 'center' : isUser ? 'flex-end' : 'flex-start',
          },
        },
        h(
          'div',
          { style: { maxWidth: isSystem ? '100%' : '82%', minWidth: 0 } },
          h(
            'div',
            {
              style: {
                display: 'flex',
                gap: 8,
                alignItems: 'baseline',
                justifyContent: isSystem ? 'center' : isUser ? 'flex-end' : 'flex-start',
                marginBottom: 5,
                fontSize: 11,
                opacity: 0.55,
              },
            },
            h('span', null, roleLabel(t, message.role)),
            sourceLabel ? h('span', {
              style: {
                fontSize: 10,
                padding: '1px 5px',
                borderRadius: 6,
                background: sourceLabel === 'QQ' ? 'rgba(59,130,246,0.18)' : 'rgba(236,72,153,0.16)',
              },
            }, sourceLabel) : null,
            time ? h('span', null, time) : null,
            !isUser && !isSystem && textOf(message.content).trim()
              ? h('button', {
                  type: 'button',
                  title: '播放语音',
                  'aria-label': '播放语音',
                  onClick: (event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    void speakText(textOf(message.content))
                  },
                  style: {
                    border: 0,
                    background: 'transparent',
                    cursor: 'pointer',
                    padding: '0 2px',
                    fontSize: 14,
                    lineHeight: 1,
                    opacity: 0.7,
                  },
                }, '🔊')
              : null,
          ),
          h(
            'div',
            {
              style: {
                ...S.bubble,
                background: isSystem
                  ? 'rgba(127,127,127,0.06)'
                  : isUser
                    ? 'rgba(59,130,246,0.13)'
                    : 'rgba(127,127,127,0.10)',
                borderColor: isSystem
                  ? 'rgba(127,127,127,0.14)'
                  : isUser
                    ? 'rgba(59,130,246,0.24)'
                    : 'rgba(127,127,127,0.19)',
                textAlign: isSystem ? 'center' : 'left',
              },
            },
            ...images.map((image, index) => h(ImageBubble, { key: index + ':' + image.file, image })),
            (images.length > 0 && textOf(message.content) === '[图片]' ? null : textOf(message.content)),
          ),
        ),
      )
    }

    function TypingRow({ t }) {
      return h(
        'div',
        { style: { display: 'flex', justifyContent: 'flex-start' } },
        h(
          'div',
          {
            style: {
              ...S.bubble,
              background: 'rgba(127,127,127,0.08)',
              borderColor: 'rgba(127,127,127,0.16)',
              opacity: 0.7,
            },
          },
          t('typing'),
        ),
      )
    }

    function MemoryIcon({ size = 18 }) {
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
        },
        h('path', {
          d: 'M4.5 5.5h15A1.5 1.5 0 0 1 21 7v8.2a1.5 1.5 0 0 1-1.5 1.5h-7.1L7 20.5v-3.8H4.5A1.5 1.5 0 0 1 3 15.2V7a1.5 1.5 0 0 1 1.5-1.5Z',
        }),
        h('path', { d: 'M7.2 9.4h9.6M7.2 12.6h5.8' }),
      )
    }

    function MemoryPage({ t }) {
      const [snapshot, setSnapshot] = React.useState({
        phase: 'loading',
        payload: null,
        error: null,
        at: 0,
      })
      const [busy, setBusy] = React.useState(false)
      const [draft, setDraft] = React.useState('')
      const [sending, setSending] = React.useState(false)
      const [pending, setPending] = React.useState(null)
      const [pendingImages, setPendingImages] = React.useState([])
      const [pendingVideos, setPendingVideos] = React.useState([])
      const [visibleCount, setVisibleCount] = React.useState(10)
      const [sendError, setSendError] = React.useState(null)
      const alive = React.useRef(true)
      const sendingRef = React.useRef(false)
      const scrollRef = React.useRef(null)
      const inputRef = React.useRef(null)

      React.useEffect(() => {
        sendingRef.current = sending
      }, [sending])

      const load = React.useCallback(async (silent) => {
        if (!silent) setBusy(true)
        try {
          const payload = await readMemory()
          if (!alive.current) return
          setSnapshot({
            phase: payload.ok ? 'ready' : payload.error === 'missing' ? 'missing' : 'failed',
            payload,
            error: payload.ok ? null : payload.detail || payload.error || null,
            at: Date.now(),
          })
        } catch (error) {
          if (!alive.current) return
          setSnapshot((previous) => ({
            phase: 'failed',
            payload: previous.payload,
            error: String(error?.message ?? error),
            at: Date.now(),
          }))
        } finally {
          if (!silent && alive.current) setBusy(false)
        }
      }, [])

      React.useEffect(() => {
        alive.current = true
        load(false)
        const timer = setInterval(() => {
          if (sendingRef.current) return
          if (typeof document === 'undefined' || document.visibilityState === 'visible') load(true)
        }, 5000)
        return () => {
          alive.current = false
          clearInterval(timer)
        }
      }, [load])

      const payload = snapshot.payload
      const messages = React.useMemo(() => collectMessages(payload), [payload])
      const visibleMessages = React.useMemo(
        () => messages.slice(Math.max(0, messages.length - visibleCount)),
        [messages, visibleCount],
      )
      const hasOlder = messages.length > visibleMessages.length
      const ready = Boolean(payload && payload.ok)
      const stickRef = React.useRef(true)

      React.useLayoutEffect(() => {
        const element = scrollRef.current
        if (element && stickRef.current) element.scrollTop = element.scrollHeight
      })

      React.useEffect(() => {
        const element = scrollRef.current
        if (!element || !stickRef.current) return
        const pin = () => {
          if (stickRef.current) element.scrollTop = element.scrollHeight
        }
        const first = setTimeout(pin, 120)
        const second = setTimeout(pin, 420)
        return () => {
          clearTimeout(first)
          clearTimeout(second)
        }
      })

      const onScroll = () => {
        const element = scrollRef.current
        if (!element) return
        stickRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 240
      }

      const changeDraft = (event) => {
        setDraft(event.target.value)
        if (sendError) setSendError(null)
      }

      const addFiles = (list) => {
        const all = Array.from(list || []).filter(Boolean)
        const imageFiles = all
          .filter((file) => !file.type || String(file.type).startsWith('image/'))
          .slice(0, Math.max(0, 4 - pendingImages.length))
        const videoFiles = all
          .filter((file) => String(file.type || '').startsWith('video/') || /\.(mp4|mov|mkv|webm)$/i.test(String(file.name || '')))
          .slice(0, Math.max(0, 1 - pendingVideos.length))
        const jobs = []
        if (imageFiles.length > 0) {
          jobs.push(Promise.all(imageFiles.map(readImageFile)).then((items) => setPendingImages((previous) => [...previous, ...items])))
        }
        if (videoFiles.length > 0) {
          jobs.push(Promise.all(videoFiles.map(readVideoFile)).then((items) => setPendingVideos((previous) => [...previous, ...items])))
        }
        Promise.all(jobs).catch((error) => setSendError(String(error?.message ?? error)))
      }

      const onPasteImage = (event) => {
        const files = event.clipboardData?.files
        if (files && files.length) {
          event.preventDefault()
          event.stopPropagation()
          addFiles(files)
        }
      }

      const onDropImage = (event) => {
        const files = event.dataTransfer?.files
        if (files && files.length) {
          event.preventDefault()
          event.stopPropagation()
          addFiles(files)
        }
      }

      const send = React.useCallback(async () => {
        const text = draft.trim()
        const images = pendingImages
        const videos = pendingVideos
        if ((text === '' && images.length === 0 && videos.length === 0) || sending) return
        if (text.length > MAX_TEXT) {
          setSendError(t('tooLong'))
          return
        }
        setSending(true)
        setSendError(null)
        setPending({ role: 'user', content: text || (videos.length > 0 ? '[视频]' : '[图片]'), ts: Date.now() })
        setDraft('')
        try {
          await sendToPet(
            text,
            images.map(({ name, mime, data }) => ({ name, mime, data })),
            videos.map(({ name, path }) => ({ name, path })),
          )
          await load(true)
          setPending(null)
          setPendingImages([])
          setPendingVideos([])
          if (inputRef.current) inputRef.current.focus()
        } catch (error) {
          setPending(null)
          setDraft(text)
          setSendError(String(error?.message ?? error))
        } finally {
          setSending(false)
        }
      }, [draft, pendingImages, pendingVideos, sending, load, t])

      const onKeyDown = (event) => {
        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent?.isComposing) {
          event.preventDefault()
          send()
        }
      }

      const header = h(
        'div',
        { style: S.header },
        h(
          'div',
          { style: S.headerText },
          h('h1', { style: S.title }, t('title')),
          h('div', { style: S.subtitle }, t('subtitle')),
          h('div', { style: S.path }, (payload && payload.path) || MEMORY_HINT),
        ),
        h(
          'button',
          {
            type: 'button',
            style: S.button,
            onClick: () => load(false),
            disabled: busy,
            title: t('refresh'),
          },
          busy ? t('refreshing') : t('refresh'),
        ),
      )

      const meta = h(
        'div',
        { style: S.meta },
        h('span', null, messages.length + ' ' + t('count')),
        payload && payload.mtime ? h('span', null, t('updated') + ' ' + formatTime(payload.mtime)) : null,
      )

      let body
      if (!payload && snapshot.phase === 'loading') {
        body = h('div', { style: S.notice }, t('refreshing'))
      } else if (payload && !payload.ok) {
        body = h(
          'div',
          { style: S.card },
          h('div', { style: S.cardTitle }, t(snapshot.phase === 'missing' ? 'missing' : 'failed')),
          h('div', { style: S.path }, payload.path || MEMORY_HINT),
          snapshot.error ? h('div', { style: S.detail }, snapshot.error) : null,
          h(
            'button',
            { type: 'button', style: S.button, onClick: () => load(false), disabled: busy },
            busy ? t('refreshing') : t('refresh'),
          ),
        )
      } else if (messages.length === 0 && !pending) {
        body = h('div', { style: S.notice }, t('empty'))
      } else {
        body = h(
          'div',
          { style: S.list },
          hasOlder
            ? h(
                'button',
                {
                  type: 'button',
                  style: { ...S.button, alignSelf: 'center', marginBottom: 4 },
                  onClick: () => setVisibleCount((value) => value + 20),
                },
                t('older'),
              )
            : null,
          visibleMessages.map((message, index) => h(MessageRow, { key: index + ':' + (message.ts || ''), t, message })),
          pending ? h(MessageRow, { key: 'pending-user', t, message: pending }) : null,
          pending ? h(TypingRow, { key: 'pending-typing', t }) : null,
        )
      }

      const canSend = (draft.trim() !== '' || pendingImages.length > 0 || pendingVideos.length > 0) && !sending

      const composer = h(
        'div',
        {
          style: S.composerBar,
          onDragOver: (event) => {
            if (event.dataTransfer?.types?.includes('Files')) event.preventDefault()
          },
          onDrop: onDropImage,
        },
        h(
          'div',
          { style: S.composerInner },
          h(
            'div',
            { style: { flex: 1, minWidth: 0 } },
            pendingImages.length > 0
              ? h(
                  'div',
                  { style: S.imageStrip },
                  pendingImages.map((image, index) =>
                    h(
                      'div',
                      { key: index + ':' + image.name, style: S.imageThumb },
                      h('img', { src: image.dataUrl, alt: image.name, style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' } }),
                      h(
                        'button',
                        {
                          type: 'button',
                          style: S.imageRemove,
                          onClick: () => setPendingImages((previous) => previous.filter((_, i) => i !== index)),
                          title: '移除',
                        },
                        '×',
                      ),
                    ),
                  ),
                )
              : null,
            pendingVideos.length > 0
              ? h(
                  'div',
                  { style: S.imageStrip },
                  pendingVideos.map((video, index) =>
                    h(
                      'div',
                      { key: index + ':' + video.name, style: S.imageThumb, title: video.name },
                      h('div', { style: { fontSize: 11, color: '#3451b2', textAlign: 'center', lineHeight: '48px' } }, 'MP4'),
                      h(
                        'button',
                        {
                          type: 'button',
                          style: S.imageRemove,
                          onClick: () => setPendingVideos((previous) => previous.filter((_, i) => i !== index)),
                          title: '移除',
                        },
                        '×',
                      ),
                    ),
                  ),
                )
              : null,
            pendingVideos.length > 0 ? h('div', { style: { color: '#3451b2', fontSize: 12, padding: '6px 0' } }, '[本地视频处理中...]') : null,
            sendError ? h('div', { style: S.sendError }, sendError) : null,
            h('textarea', {
              ref: inputRef,
              value: draft,
              rows: 1,
              maxLength: MAX_TEXT,
              placeholder: t('placeholder'),
              style: S.textarea,
              onChange: changeDraft,
              onKeyDown,
              onPaste: onPasteImage,
              onDrop: onDropImage,
              onDragOver: (event) => {
                if (event.dataTransfer?.types?.includes('Files')) event.preventDefault()
              },
              'aria-label': t('placeholder'),
            }),
          ),
          h(
            'button',
            {
              type: 'button',
              style: canSend ? S.sendButton : { ...S.sendButton, ...S.sendButtonDisabled },
              onClick: send,
              disabled: !canSend,
              title: t('send'),
              'aria-label': t('send'),
            },
            h(
              'svg',
              {
                width: 18,
                height: 18,
                viewBox: '0 0 24 24',
                fill: 'none',
                stroke: 'currentColor',
                strokeWidth: 2,
                strokeLinecap: 'round',
                strokeLinejoin: 'round',
                'aria-hidden': true,
              },
              h('path', { d: 'M12 19V5M6 11l6-6 6 6' }),
            ),
          ),
        ),
      )

      return h(
        'div',
        { style: S.page },
        h('div', { style: S.headerArea }, h('div', { style: S.wrap }, header)),
        h(
          'div',
          { ref: scrollRef, style: S.scroll, onScroll },
          h(
            'div',
            { style: S.wrap },
            ready ? meta : null,
            body,
            ready && payload && payload.data
              ? h(
                  'details',
                  { style: S.details },
                  h('summary', { style: S.summary }, t('raw')),
                  h('pre', { style: S.pre }, JSON.stringify(payload.data, null, 2)),
                )
              : null,
          ),
        ),
        composer,
      )
    }

    const S = {
      page: {
        height: '100%',
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        paddingTop: 'calc(var(--dsh-frame-top-clearance, 48px) + 18px)',
        color: 'inherit',
        overflow: 'hidden',
      },
      scroll: {
        flex: '1 1 auto',
        minHeight: 0,
        overflowY: 'auto',
        overflowAnchor: 'none',
        padding: '0 28px 28px',
      },
      headerArea: {
        flex: 'none',
        padding: '0 28px 10px',
      },
      wrap: { maxWidth: 820, margin: '0 auto', width: '100%' },
      header: {
        display: 'flex',
        alignItems: 'flex-start',
        gap: 16,
        marginBottom: 10,
      },
      headerText: { flex: 1, minWidth: 0 },
      title: {
        margin: 0,
        fontSize: 22,
        lineHeight: 1.25,
        fontWeight: 600,
        letterSpacing: '-0.01em',
      },
      subtitle: {
        marginTop: 4,
        fontSize: 12,
        opacity: 0.55,
      },
      path: {
        marginTop: 6,
        fontSize: 11.5,
        opacity: 0.5,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      button: {
        flex: 'none',
        appearance: 'none',
        border: '1px solid rgba(127,127,127,0.28)',
        background: 'transparent',
        color: 'inherit',
        borderRadius: 9,
        padding: '6px 12px',
        fontSize: 12,
        lineHeight: 1.4,
        cursor: 'pointer',
      },
      meta: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        margin: '18px 0 14px',
        fontSize: 11.5,
        opacity: 0.55,
      },
      list: { display: 'flex', flexDirection: 'column', gap: 14, paddingBottom: 8 },
      bubble: {
        border: '1px solid transparent',
        borderRadius: 13,
        padding: '10px 14px',
        fontSize: 'var(--dsh-content-font-size, 14px)',
        lineHeight: 1.7,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
      },
      notice: {
        marginTop: 28,
        padding: '22px 18px',
        borderRadius: 12,
        border: '1px dashed rgba(127,127,127,0.28)',
        fontSize: 13,
        opacity: 0.65,
        textAlign: 'center',
      },
      card: {
        marginTop: 24,
        padding: '18px 18px 16px',
        borderRadius: 12,
        border: '1px solid rgba(127,127,127,0.22)',
        background: 'rgba(127,127,127,0.06)',
      },
      cardTitle: { fontSize: 14, fontWeight: 600 },
      detail: {
        marginTop: 8,
        fontSize: 12,
        opacity: 0.6,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
      },
      details: { marginTop: 20 },
      summary: { cursor: 'pointer', fontSize: 12, opacity: 0.55 },
      pre: {
        marginTop: 10,
        padding: 16,
        borderRadius: 10,
        border: '1px solid rgba(127,127,127,0.2)',
        background: 'rgba(127,127,127,0.07)',
        fontSize: 12,
        lineHeight: 1.6,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
        overflow: 'auto',
        maxHeight: 420,
      },
      composerBar: {
        flex: 'none',
        borderTop: '1px solid rgba(127,127,127,0.18)',
        background: 'rgba(127,127,127,0.035)',
        padding: '10px 28px 16px',
      },
      composerInner: {
        maxWidth: 820,
        margin: '0 auto',
        display: 'flex',
        alignItems: 'flex-end',
        gap: 10,
      },
      textarea: {
        display: 'block',
        width: '100%',
        minHeight: 42,
        maxHeight: 120,
        boxSizing: 'border-box',
        resize: 'none',
        padding: '10px 14px',
        borderRadius: 12,
        border: '1px solid rgba(127,127,127,0.26)',
        background: 'transparent',
        color: 'inherit',
        fontSize: 'var(--dsh-content-font-size, 14px)',
        lineHeight: 1.5,
        fontFamily: 'inherit',
        outline: 'none',
      },
      sendButton: {
        flex: 'none',
        display: 'grid',
        placeItems: 'center',
        width: 42,
        height: 42,
        padding: 0,
        border: 'none',
        borderRadius: '50%',
        background: '#3b82f6',
        color: '#ffffff',
        cursor: 'pointer',
      },
      sendButtonDisabled: {
        background: 'rgba(127,127,127,0.22)',
        color: 'rgba(255,255,255,0.7)',
        cursor: 'default',
      },
      sendError: {
        marginBottom: 6,
        fontSize: 12,
        color: '#d9534f',
        overflowWrap: 'anywhere',
      },
      imageStrip: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: 6,
        marginBottom: 8,
      },
      imageThumb: {
        position: 'relative',
        width: 52,
        height: 52,
        borderRadius: 8,
        overflow: 'hidden',
        background: 'rgba(127,127,127,0.08)',
      },
      imageRemove: {
        position: 'absolute',
        right: 0,
        top: 0,
        width: 16,
        height: 16,
        border: 0,
        borderRadius: '0 0 0 6px',
        background: 'rgba(0,0,0,0.55)',
        color: '#fff',
        fontSize: 12,
        lineHeight: '16px',
        padding: 0,
        cursor: 'pointer',
      },
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-pet-memory: dictionaries')
        const t = ctx.locale.bind(NS)
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 40,
              locale: NS,
              label: () => t('panel'),
            },
            MemoryIcon,
          ),
        )
        ctx.slots.inject('main', () =>
          ctx.slots.register(
            {
              name: 'main',
              key: PANEL_ID,
              locale: NS,
              inject: () => ({ t }),
            },
            MemoryPage,
          ),
        )
      },
    }
  },
})
