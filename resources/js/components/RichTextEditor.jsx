import { useEffect } from 'react';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import {
    Heading1, Heading2, Heading3, Pilcrow,
    Bold, Italic, Strikethrough, Highlighter,
    AlignLeft, AlignCenter, AlignRight, AlignJustify,
} from 'lucide-react';
import { emptyDoc } from '../lib/richText';
import { t } from '../lib/i18n';

/**
 * One toolbar control.
 *
 * **`aria-pressed`, not only a background colour.** Whether the selection is
 * bold was information a sighted reader had and nobody else - the same defect
 * the entry form's language tabs carried until #117's review round. `label`
 * does the other two jobs an icon cannot do for itself: it names the button in
 * the accessibility tree and gives a pointer user a tooltip.
 */
const Control = ({ icon: Icon, label, active, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        title={label}
        className={`inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent ${
            active
                ? 'bg-accent text-accent-fg'
                : 'text-fg-muted hover:bg-surface hover:text-fg'
        }`}
    >
        <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
);

const Divider = () => <div className="mx-1 w-px self-stretch bg-line-strong" aria-hidden="true" />;

const MenuBar = ({ editor }) => {
    const editorState = useEditorState({
        editor,
        selector: ctx => ({
            isBold: ctx.editor.isActive('bold') ?? false,
            isItalic: ctx.editor.isActive('italic') ?? false,
            isStrike: ctx.editor.isActive('strike') ?? false,
            isHighlight: ctx.editor.isActive('highlight') ?? false,
            isAlignLeft: ctx.editor.isActive({ textAlign: 'left' }) ?? false,
            isAlignCenter: ctx.editor.isActive({ textAlign: 'center' }) ?? false,
            isAlignRight: ctx.editor.isActive({ textAlign: 'right' }) ?? false,
            isAlignJustify: ctx.editor.isActive({ textAlign: 'justify' }) ?? false,
            isParagraph: ctx.editor.isActive('paragraph') ?? false,
            isHeading1: ctx.editor.isActive('heading', { level: 1 }) ?? false,
            isHeading2: ctx.editor.isActive('heading', { level: 2 }) ?? false,
            isHeading3: ctx.editor.isActive('heading', { level: 3 }) ?? false,
        }),
    });

    if (!editor) return null;

    const chain = () => editor.chain().focus();

    return (
        // `toolbar`, because these are controls over one editor rather than
        // twelve unrelated buttons that happen to sit above a box.
        <div
            role="toolbar"
            aria-label={t('Formatting')}
            className="mb-2 flex flex-wrap items-center gap-0.5 rounded-lg border border-line bg-surface-muted p-1.5"
        >
            <Control icon={Heading1} label={t('Heading 1')} active={editorState.isHeading1} onClick={() => chain().toggleHeading({ level: 1 }).run()} />
            <Control icon={Heading2} label={t('Heading 2')} active={editorState.isHeading2} onClick={() => chain().toggleHeading({ level: 2 }).run()} />
            <Control icon={Heading3} label={t('Heading 3')} active={editorState.isHeading3} onClick={() => chain().toggleHeading({ level: 3 }).run()} />
            <Control icon={Pilcrow} label={t('Paragraph')} active={editorState.isParagraph} onClick={() => chain().setParagraph().run()} />

            <Divider />

            <Control icon={Bold} label={t('Bold')} active={editorState.isBold} onClick={() => chain().toggleBold().run()} />
            <Control icon={Italic} label={t('Italic')} active={editorState.isItalic} onClick={() => chain().toggleItalic().run()} />
            <Control icon={Strikethrough} label={t('Strikethrough')} active={editorState.isStrike} onClick={() => chain().toggleStrike().run()} />
            <Control icon={Highlighter} label={t('Highlight')} active={editorState.isHighlight} onClick={() => chain().toggleHighlight().run()} />

            <Divider />

            <Control icon={AlignLeft} label={t('Left')} active={editorState.isAlignLeft} onClick={() => chain().setTextAlign('left').run()} />
            <Control icon={AlignCenter} label={t('Center')} active={editorState.isAlignCenter} onClick={() => chain().setTextAlign('center').run()} />
            <Control icon={AlignRight} label={t('Right')} active={editorState.isAlignRight} onClick={() => chain().setTextAlign('right').run()} />
            <Control icon={AlignJustify} label={t('Justify')} active={editorState.isAlignJustify} onClick={() => chain().setTextAlign('justify').run()} />
        </div>
    );
};

export default function RichTextEditor({ value, onChange }) {
    const editor = useEditor({
        extensions: [
            StarterKit,
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            Highlight,
        ],
        content: value ?? emptyDoc(),
        onUpdate: ({ editor }) => {
            // The document tree goes to EntryForm state, not an HTML string:
            // it is stored and re-rendered structurally, never as raw markup.
            onChange(editor.getJSON());
        },
        editorProps: {
            attributes: {
                // `prose` for the type scale and list markers; its colours are
                // re-pointed at the panel's tokens in `app.css`, because the
                // plugin's own are fixed grays that measured 2.01:1 on the dark
                // surface - everything a client had written, nearly invisible.
                class: 'prose max-w-none rounded-lg border border-line bg-surface p-4 min-h-[200px] focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring-accent tiptap-editor',
            },
        },
    });

    // Synchronize external value changes (e.g., when editing an existing entry).
    // Compared by value, since getJSON() returns a fresh object every call.
    useEffect(() => {
        if (!editor) return;

        const incoming = value ?? emptyDoc();

        if (JSON.stringify(incoming) !== JSON.stringify(editor.getJSON())) {
            editor.commands.setContent(incoming);
        }
    }, [value, editor]);

    return (
        <div className="rich-text-container w-full">
            <MenuBar editor={editor} />
            <EditorContent editor={editor} />
        </div>
    );
}
