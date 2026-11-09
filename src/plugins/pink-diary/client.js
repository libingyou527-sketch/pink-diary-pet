window.__ModuleLoader__.load({
  id: 'xu-pink-diary',
  factory(require) {
    const React = require('react')
    const h = React.createElement

    const NS = 'xu-pink-diary'
    const PANEL_ID = 'xu-pink-diary'
    const DIARY_ROUTE = '/xu-diary'
    const PET_CHAT_ROUTE = '/dsh-pet-7340/chat?pet=main&surface=any'
    const FALLBACK_DIR = '~/.dsh/pink-diary'
    const PINK = '#ec4899'
    const PINK_DARK = '#db2777'

    const zh = {
      panel: '絮的粉色日记',
      title: '絮的粉色日记',
      subtitle: 'dsh-pet · 粉色日记本',
      autoNote: '珍贵对话自动记入当天日记；每天 23:59 写一日总结。',
      count: '篇日记',
      updated: '最近更新',
      refresh: '刷新',
      refreshing: '刷新中…',
      writeForMe: '让絮写今天',
      writing: '絮正在写…',
      readByPet: '让絮读',
      reading: '絮正在读…',
      delete: '删除',
      deleting: '删除中…',
      confirmDelete: '删除这篇日记？此操作不可恢复。',
      xuSays: '絮说',
      readFailed: '读取失败',
      placeholder: '把今天写进絮的粉色日记…',
      save: '保存日记',
      saving: '保存中…',
      authorLabel: '署名',
      you: '你',
      xu: '絮',
      emptyTitle: '还没有日记',
      emptyText: '让絮写第一篇，或者自己在下面写点什么。',
      emptyAction: '让絮写第一篇',
      errorTitle: '日记本暂时打不开',
      retry: '重试',
      loading: '正在翻开日记本…',
    }

    const en = {
      panel: "Xu's Pink Diary",
      title: "Xu's Pink Diary",
      subtitle: 'dsh-pet · pink diary',
      autoNote: 'Precious moments are written into today’s diary; a daily summary is added at 23:59.',
      count: 'entries',
      updated: 'Updated',
      refresh: 'Refresh',
      refreshing: 'Refreshing…',
      writeForMe: 'Let Xu write',
      writing: 'Xu is writing…',
      readByPet: 'Let Xu read',
      reading: 'Xu is reading…',
      delete: 'Delete',
      deleting: 'Deleting…',
      confirmDelete: 'Delete this entry? This cannot be undone.',
      xuSays: 'Xu says',
      readFailed: 'Could not read',
      placeholder: 'Write today into Xu’s pink diary…',
      save: 'Save entry',
      saving: 'Saving…',
      authorLabel: 'Sign as',
      you: 'You',
      xu: 'Xu',
      emptyTitle: 'No entries yet',
      emptyText: 'Let Xu write the first one, or write something below.',
      emptyAction: 'Let Xu write the first entry',
      errorTitle: 'The diary cannot be opened',
      retry: 'Retry',
      loading: 'Opening the diary…',
    }

    async function fetchEntries() {
      const response = await fetch(DIARY_ROUTE + '/entries?t=' + Date.now(), {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      })
      if (!response.ok) throw new Error('HTTP ' + response.status)
      const result = await response.json()
      if (!result.ok) throw new Error(result.error || '读取失败')
      return result
    }

    async function createEntry(content, author) {
      const response = await fetch(DIARY_ROUTE + '/entries', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ content, author }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || result === null || result.ok !== true) {
        throw new Error((result && result.error) || 'HTTP ' + response.status)
      }
      return result.entry
    }

    async function deleteEntry(id) {
      const response = await fetch(DIARY_ROUTE + '/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ id }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || result === null || result.ok !== true) {
        throw new Error((result && result.error) || 'HTTP ' + response.status)
      }
      return result
    }

    async function petChat(text) {
      const response = await fetch(PET_CHAT_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ text }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || result === null || result.ok !== true) {
        throw new Error((result && (result.message || result.reason)) || 'HTTP ' + response.status)
      }
      return result
    }

    function formatEntryDate(value) {
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return ''
      try {
        return date.toLocaleString('zh-CN', {
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      } catch {
        return ''
      }
    }

    function formatFull(value) {
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return ''
      try {
        return date.toLocaleString('zh-CN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        })
      } catch {
        return ''
      }
    }

    function todayLong() {
      try {
        return new Date().toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          weekday: 'long',
        })
      } catch {
        return new Date().toISOString().slice(0, 10)
      }
    }

    function DiaryIcon({ size = 18 }) {
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
        h('path', { d: 'M5 4.8h11.2A2.8 2.8 0 0 1 19 7.6v11.6a1.8 1.8 0 0 1-1.8 1.8H7.4A2.4 2.4 0 0 1 5 18.6V4.8Z' }),
        h('path', { d: 'M8.2 4.8v14.2' }),
        h('path', {
          d: 'M16.3 9.9c-.8-1.1-2.6-.8-2.6.6 0 1.2 1.7 2.2 2.6 2.9.9-.7 2.6-1.7 2.6-2.9 0-1.4-1.8-1.7-2.6-.6Z',
          fill: 'currentColor',
          stroke: 'none',
        }),
      )
    }

    function EntryCard({ t, entry, comment, busy, deleting, onRead, onDelete }) {
      const isXu = entry.author === '絮'
      return h(
        'article',
        { style: S.card },
        h(
          'div',
          { style: S.cardHead },
          h('div', { style: S.cardDate }, formatEntryDate(entry.date)),
          h('span', { style: isXu ? S.chipXu : S.chipYou }, entry.author),
        ),
        h('div', { style: S.cardText }, entry.content),
        comment === null
          ? h('div', { style: S.comment }, h('span', { style: { opacity: 0.6 } }, t('reading')))
          : null,
        typeof comment === 'string' && comment !== ''
          ? h(
              'div',
              { style: S.comment },
              h('div', { style: S.commentLabel }, t('xuSays')),
              h('div', { style: S.commentText }, comment),
            )
          : null,
        h(
          'div',
          { style: S.cardActions },
          h(
            'button',
            { type: 'button', style: S.action, onClick: () => onRead(entry), disabled: busy },
            busy ? t('reading') : t('readByPet'),
          ),
          h(
            'button',
            { type: 'button', style: S.actionDanger, onClick: () => onDelete(entry), disabled: deleting },
            deleting ? t('deleting') : t('delete'),
          ),
        ),
      )
    }

    function DiaryPage({ t }) {
      const [entries, setEntries] = React.useState([])
      const [phase, setPhase] = React.useState('loading')
      const [error, setError] = React.useState(null)
      const [dir, setDir] = React.useState(FALLBACK_DIR)
      const [draft, setDraft] = React.useState('')
      const [author, setAuthor] = React.useState('你')
      const [saving, setSaving] = React.useState(false)
      const [petBusy, setPetBusy] = React.useState(null)
      const [deletingId, setDeletingId] = React.useState(null)
      const [comments, setComments] = React.useState({})
      const scrollRef = React.useRef(null)

      const load = React.useCallback(async (silent) => {
        if (!silent) setPhase('loading')
        try {
          const result = await fetchEntries()
          setEntries(result.entries)
          setDir(result.dir || FALLBACK_DIR)
          setPhase('ready')
          setError(null)
        } catch (error) {
          setError(String(error?.message ?? error))
          setPhase('error')
        }
      }, [])

      React.useEffect(() => {
        load(false)
      }, [load])

      const saveManual = React.useCallback(async () => {
        const text = draft.trim()
        if (text === '' || saving) return
        setSaving(true)
        setError(null)
        try {
          await createEntry(text, author)
          setDraft('')
          await load(true)
          if (scrollRef.current) scrollRef.current.scrollTop = 0
        } catch (error) {
          setError(String(error?.message ?? error))
        } finally {
          setSaving(false)
        }
      }, [draft, author, saving, load])

      const writeByPet = React.useCallback(async () => {
        if (petBusy) return
        setPetBusy('write')
        setError(null)
        try {
          const response = await fetch('/dsh-pet-7340/diary?pet=main&surface=any', {
            method: 'POST',
            headers: { 'content-type': 'application/json', accept: 'application/json' },
            body: '{}',
          })
          const result = await response.json().catch(() => null)
          if (!response.ok || result === null || result.ok !== true) {
            throw new Error((result && (result.message || result.reason)) || 'HTTP ' + response.status)
          }
          await load(true)
          if (scrollRef.current) scrollRef.current.scrollTop = 0
        } catch (error) {
          setError(String(error?.message ?? error))
        } finally {
          setPetBusy(null)
        }
      }, [petBusy, load])

      const readByPet = React.useCallback(
        async (entry) => {
          if (petBusy) return
          setPetBusy(entry.id)
          setError(null)
          setComments((previous) => ({ ...previous, [entry.id]: null }))
          try {
            const whose = entry.author === '絮' ? '你' : '我'
            const prompt = `这是${whose}写于 ${formatFull(entry.date)} 的粉色日记：\n\n${entry.content}\n\n读完后，用两三句话说说你现在的感受。只回复感受，不要复述日记。`
            const result = await petChat(prompt)
            setComments((previous) => ({ ...previous, [entry.id]: result.text.trim() }))
          } catch (error) {
            setComments((previous) => ({
              ...previous,
              [entry.id]: t('readFailed') + '：' + String(error?.message ?? error),
            }))
          } finally {
            setPetBusy(null)
          }
        },
        [petBusy, t],
      )

      const removeEntry = React.useCallback(
        async (entry) => {
          if (deletingId) return
          if (!window.confirm(t('confirmDelete'))) return
          setDeletingId(entry.id)
          setError(null)
          try {
            await deleteEntry(entry.id)
            setComments((previous) => {
              const next = { ...previous }
              delete next[entry.id]
              return next
            })
            await load(true)
          } catch (error) {
            setError(String(error?.message ?? error))
          } finally {
            setDeletingId(null)
          }
        },
        [deletingId, load, t],
      )

      const header = h(
        'div',
        { style: S.header },
        h(
          'div',
          { style: S.headerText },
          h(
            'div',
            { style: S.titleRow },
            h('span', { style: S.titleIcon }, h(DiaryIcon, { size: 22 })),
            h('h1', { style: S.title }, t('title')),
          ),
          h('div', { style: S.subtitle }, t('subtitle')),
          h('div', { style: S.path }, dir),
          h('div', { style: S.autoNote }, t('autoNote')),
        ),
        h(
          'div',
          { style: S.headerActions },
          h(
            'button',
            { type: 'button', style: S.primary, onClick: writeByPet, disabled: Boolean(petBusy) },
            petBusy === 'write' ? t('writing') : t('writeForMe'),
          ),
          h(
            'button',
            { type: 'button', style: S.ghost, onClick: () => load(false), disabled: phase === 'loading' },
            phase === 'loading' ? t('refreshing') : t('refresh'),
          ),
        ),
      )

      const meta =
        phase === 'ready' && entries.length > 0
          ? h(
              'div',
              { style: S.meta },
              h('span', null, entries.length + ' ' + t('count')),
              h('span', null, t('updated') + ' ' + formatEntryDate(entries[0].date)),
            )
          : null

      let body
      if (phase === 'loading' && entries.length === 0) {
        body = h('div', { style: S.notice }, t('loading'))
      } else if (phase === 'error') {
        body = h(
          'div',
          { style: S.errorCard },
          h('div', { style: S.errorTitle }, t('errorTitle')),
          h('div', { style: S.path }, dir),
          error ? h('div', { style: S.errorText }, error) : null,
          h(
            'button',
            { type: 'button', style: S.primary, onClick: () => load(false) },
            t('retry'),
          ),
        )
      } else if (entries.length === 0) {
        body = h(
          'div',
          { style: S.empty },
          h('div', { style: S.emptyIcon }, h(DiaryIcon, { size: 36 })),
          h('div', { style: S.emptyTitle }, t('emptyTitle')),
          h('div', { style: S.emptyText }, t('emptyText')),
          h(
            'button',
            { type: 'button', style: S.primary, onClick: writeByPet, disabled: Boolean(petBusy) },
            petBusy === 'write' ? t('writing') : t('emptyAction'),
          ),
        )
      } else {
        body = h(
          'div',
          { style: S.list },
          entries.map((entry) =>
            h(EntryCard, {
              key: entry.id,
              t,
              entry,
              comment: comments[entry.id],
              busy: petBusy === entry.id,
              deleting: deletingId === entry.id,
              onRead: readByPet,
              onDelete: removeEntry,
            }),
          ),
        )
      }

      const composer = h(
        'div',
        { style: S.composerBar },
        h(
          'div',
          { style: S.composerInner },
          h(
            'div',
            { style: S.composerTop },
            h('span', { style: S.composerLabel }, t('authorLabel')),
            h(
              'div',
              { style: S.toggle },
              h(
                'button',
                {
                  type: 'button',
                  style: author === '你' ? S.toggleActive : S.toggleIdle,
                  onClick: () => setAuthor('你'),
                },
                t('you'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  style: author === '絮' ? S.toggleActive : S.toggleIdle,
                  onClick: () => setAuthor('絮'),
                },
                t('xu'),
              ),
            ),
          ),
          error ? h('div', { style: S.errorText }, error) : null,
          h(
            'div',
            { style: S.composerRow },
            h('textarea', {
              value: draft,
              rows: 2,
              maxLength: 20000,
              placeholder: t('placeholder'),
              style: S.textarea,
              onChange: (event) => setDraft(event.target.value),
              onKeyDown: (event) => {
                if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                  event.preventDefault()
                  saveManual()
                }
              },
            }),
            h(
              'button',
              {
                type: 'button',
                style: draft.trim() === '' ? { ...S.save, ...S.saveDisabled } : S.save,
                onClick: saveManual,
                disabled: draft.trim() === '' || saving,
              },
              saving ? t('saving') : t('save'),
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
          { ref: scrollRef, style: S.scroll },
          h('div', { style: S.wrap }, meta, body),
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
      headerArea: { flex: 'none', padding: '0 30px 8px' },
      scroll: { flex: '1 1 auto', minHeight: 0, overflowY: 'auto', padding: '0 30px 30px' },
      wrap: { maxWidth: 880, margin: '0 auto', width: '100%' },
      header: { display: 'flex', alignItems: 'flex-start', gap: 18, flexWrap: 'wrap' },
      headerText: { flex: 1, minWidth: 260 },
      titleRow: { display: 'flex', alignItems: 'center', gap: 9 },
      titleIcon: { display: 'flex', color: PINK },
      title: { margin: 0, fontSize: 22, lineHeight: 1.25, fontWeight: 600, letterSpacing: '-0.01em' },
      subtitle: { marginTop: 4, fontSize: 12, opacity: 0.55 },
      path: {
        marginTop: 6,
        fontSize: 11.5,
        opacity: 0.5,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      autoNote: {
        marginTop: 5,
        fontSize: 11,
        opacity: 0.42,
      },
      headerActions: { display: 'flex', gap: 9, alignItems: 'center', flex: 'none', paddingTop: 4 },
      primary: {
        appearance: 'none',
        border: 'none',
        borderRadius: 10,
        background: PINK,
        color: '#ffffff',
        padding: '8px 14px',
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 1.4,
        cursor: 'pointer',
        boxShadow: '0 2px 8px rgba(236,72,153,0.22)',
      },
      ghost: {
        appearance: 'none',
        border: '1px solid rgba(236,72,153,0.28)',
        borderRadius: 10,
        background: 'transparent',
        color: 'inherit',
        padding: '7px 12px',
        fontSize: 12.5,
        lineHeight: 1.4,
        cursor: 'pointer',
      },
      meta: { display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 11.5, opacity: 0.55, margin: '16px 0 14px' },
      list: { display: 'flex', flexDirection: 'column', gap: 14 },
      card: {
        border: '1px solid rgba(236,72,153,0.20)',
        background: 'rgba(244,114,182,0.055)',
        borderRadius: 16,
        padding: '16px 18px 12px',
      },
      cardHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 9 },
      cardDate: { fontSize: 12.5, opacity: 0.55, fontWeight: 500 },
      chipXu: {
        flex: 'none',
        fontSize: 11,
        lineHeight: 1.6,
        padding: '1px 9px',
        borderRadius: 999,
        background: 'rgba(236,72,153,0.14)',
        color: PINK_DARK,
        border: '1px solid rgba(236,72,153,0.24)',
      },
      chipYou: {
        flex: 'none',
        fontSize: 11,
        lineHeight: 1.6,
        padding: '1px 9px',
        borderRadius: 999,
        background: 'rgba(127,127,127,0.10)',
        color: 'inherit',
        border: '1px solid rgba(127,127,127,0.18)',
        opacity: 0.7,
      },
      cardText: {
        fontSize: 'var(--dsh-content-font-size, 14px)',
        lineHeight: 1.85,
        whiteSpace: 'pre-wrap',
        overflowWrap: 'anywhere',
      },
      comment: {
        marginTop: 12,
        padding: '10px 12px',
        borderLeft: '3px solid ' + PINK,
        background: 'rgba(236,72,153,0.07)',
        borderRadius: '0 10px 10px 0',
      },
      commentLabel: { fontSize: 11, fontWeight: 600, color: PINK_DARK, marginBottom: 4 },
      commentText: { fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
      cardActions: {
        display: 'flex',
        gap: 16,
        marginTop: 13,
        paddingTop: 10,
        borderTop: '1px dashed rgba(236,72,153,0.22)',
      },
      action: {
        appearance: 'none',
        border: 'none',
        background: 'transparent',
        color: PINK_DARK,
        padding: 0,
        fontSize: 12,
        lineHeight: 1.5,
        cursor: 'pointer',
      },
      actionDanger: {
        appearance: 'none',
        border: 'none',
        background: 'transparent',
        color: 'inherit',
        opacity: 0.45,
        padding: 0,
        fontSize: 12,
        lineHeight: 1.5,
        cursor: 'pointer',
      },
      empty: {
        marginTop: 26,
        padding: '36px 24px 32px',
        borderRadius: 18,
        border: '1.5px dashed rgba(236,72,153,0.30)',
        background: 'rgba(244,114,182,0.045)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        textAlign: 'center',
      },
      emptyIcon: { display: 'flex', color: PINK, opacity: 0.55 },
      emptyTitle: { fontSize: 16, fontWeight: 600 },
      emptyText: { fontSize: 12.5, opacity: 0.55, lineHeight: 1.7, marginBottom: 4 },
      notice: {
        marginTop: 28,
        padding: '22px 18px',
        borderRadius: 12,
        border: '1px dashed rgba(236,72,153,0.28)',
        fontSize: 13,
        opacity: 0.65,
        textAlign: 'center',
      },
      errorCard: {
        marginTop: 24,
        padding: '18px 18px 16px',
        borderRadius: 14,
        border: '1px solid rgba(236,72,153,0.25)',
        background: 'rgba(236,72,153,0.06)',
      },
      errorTitle: { fontSize: 14, fontWeight: 600, marginBottom: 6 },
      errorText: { fontSize: 12, color: '#d9534f', lineHeight: 1.6, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' },
      composerBar: {
        flex: 'none',
        borderTop: '1px solid rgba(236,72,153,0.22)',
        background: 'rgba(244,114,182,0.05)',
        padding: '10px 30px 16px',
      },
      composerInner: { maxWidth: 880, margin: '0 auto' },
      composerTop: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 },
      composerLabel: { fontSize: 11.5, opacity: 0.55 },
      toggle: { display: 'flex', gap: 2, padding: 2, borderRadius: 999, background: 'rgba(127,127,127,0.09)' },
      toggleActive: {
        appearance: 'none',
        border: 'none',
        borderRadius: 999,
        background: PINK,
        color: '#ffffff',
        padding: '2px 12px',
        fontSize: 11.5,
        lineHeight: 1.8,
        cursor: 'pointer',
      },
      toggleIdle: {
        appearance: 'none',
        border: 'none',
        borderRadius: 999,
        background: 'transparent',
        color: 'inherit',
        opacity: 0.6,
        padding: '2px 12px',
        fontSize: 11.5,
        lineHeight: 1.8,
        cursor: 'pointer',
      },
      composerRow: { display: 'flex', alignItems: 'flex-end', gap: 10 },
      textarea: {
        flex: 1,
        minWidth: 0,
        minHeight: 76,
        maxHeight: 220,
        boxSizing: 'border-box',
        resize: 'none',
        padding: '11px 14px',
        borderRadius: 12,
        border: '1px solid rgba(236,72,153,0.28)',
        background: 'transparent',
        color: 'inherit',
        fontSize: 'var(--dsh-content-font-size, 14px)',
        lineHeight: 1.65,
        fontFamily: 'inherit',
        outline: 'none',
      },
      save: {
        flex: 'none',
        appearance: 'none',
        border: 'none',
        borderRadius: 11,
        background: PINK,
        color: '#ffffff',
        height: 42,
        padding: '0 18px',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
      },
      saveDisabled: { background: 'rgba(236,72,153,0.22)', color: 'rgba(255,255,255,0.75)', cursor: 'default' },
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'xu-pink-diary: dictionaries')
        const t = ctx.locale.bind(NS)
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: PANEL_ID,
              order: 41,
              locale: NS,
              label: () => t('panel'),
            },
            DiaryIcon,
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
            DiaryPage,
          ),
        )
      },
    }
  },
})
