import React, { useEffect } from 'react';
import { useEditor, EditorContent, useEditorState } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import { emptyDoc } from '../lib/richText';

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

    // Helper for active button classes
    const btnClass = (isActive) =>
        `px-2 py-1 text-sm font-medium rounded border transition-colors ${isActive
            ? 'bg-indigo-600 text-white border-indigo-600'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-100'
        }`;

    return (
        <div className="flex flex-wrap gap-1 mb-2 p-2 border border-gray-300 rounded bg-gray-50">
            <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={btnClass(editorState.isHeading1)}>H1</button>
            <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btnClass(editorState.isHeading2)}>H2</button>
            <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btnClass(editorState.isHeading3)}>H3</button>
            <button type="button" onClick={() => editor.chain().focus().setParagraph().run()} className={btnClass(editorState.isParagraph)}>P</button>

            <div className="w-px bg-gray-300 mx-1"></div>

            <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btnClass(editorState.isBold)}>B</button>
            <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btnClass(editorState.isItalic)}>I</button>
            <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={btnClass(editorState.isStrike)}>S</button>
            <button type="button" onClick={() => editor.chain().focus().toggleHighlight().run()} className={btnClass(editorState.isHighlight)}>Highlight</button>

            <div className="w-px bg-gray-300 mx-1"></div>

            <button type="button" onClick={() => editor.chain().focus().setTextAlign('left').run()} className={btnClass(editorState.isAlignLeft)}>Left</button>
            <button type="button" onClick={() => editor.chain().focus().setTextAlign('center').run()} className={btnClass(editorState.isAlignCenter)}>Center</button>
            <button type="button" onClick={() => editor.chain().focus().setTextAlign('right').run()} className={btnClass(editorState.isAlignRight)}>Right</button>
            <button type="button" onClick={() => editor.chain().focus().setTextAlign('justify').run()} className={btnClass(editorState.isAlignJustify)}>Justify</button>
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
                class: 'prose max-w-none border border-gray-300 rounded p-4 min-h-[200px] bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500 tiptap-editor',
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