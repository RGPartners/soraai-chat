import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverButton,
  PopoverPanel,
  Transition,
} from '@headlessui/react';
import { File, LoaderCircle, Paperclip, Plus, Trash } from 'lucide-react';
import { Fragment, useCallback, useEffect, useRef } from 'react';
import { useChat } from '@/lib/hooks/useChat';
import { useChatFileUploader } from '@/lib/hooks/useChatFileUploader';

const Attach = () => {
  const { files, setFiles, setFileIds, autoOpenAttachmentSignal } = useChat();
  const { uploadFiles, isUploading } = useChatFileUploader();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const lastAutoOpenSignalRef = useRef(0);

  const handleChange = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const selectedFiles = event.target.files;
      if (!selectedFiles || selectedFiles.length === 0) {
        return;
      }

      await uploadFiles(selectedFiles);
      event.target.value = '';
    },
    [uploadFiles],
  );

  useEffect(() => {
    if (!autoOpenAttachmentSignal) {
      return;
    }

    if (autoOpenAttachmentSignal === lastAutoOpenSignalRef.current) {
      return;
    }

    lastAutoOpenSignalRef.current = autoOpenAttachmentSignal;

    if (isUploading) {
      return;
    }

    fileInputRef.current?.click();
  }, [autoOpenAttachmentSignal, isUploading]);

  return isUploading ? (
    <div className="active:border-none hover:bg-light-200 hover:dark:bg-dark-200 p-2 rounded-lg focus:outline-none text-black/50 dark:text-white/50 transition duration-200">
      <LoaderCircle size={16} className="text-sky-400 animate-spin" />
    </div>
  ) : files.length > 0 ? (
    <Popover className="relative w-full max-w-[15rem] md:max-w-md lg:max-w-lg">
      <PopoverButton
        type="button"
        className="active:border-none hover:bg-light-200 hover:dark:bg-dark-200 p-2 rounded-lg focus:outline-none headless-open:text-black dark:headless-open:text-white text-black/50 dark:text-white/50 active:scale-95 transition duration-200 hover:text-black dark:hover:text-white"
      >
        <File size={16} className="text-sky-400" />
      </PopoverButton>
      <Transition
        as={Fragment}
        enter="transition ease-out duration-150"
        enterFrom="opacity-0 translate-y-1"
        enterTo="opacity-100 translate-y-0"
        leave="transition ease-in duration-150"
        leaveFrom="opacity-100 translate-y-0"
        leaveTo="opacity-0 translate-y-1"
      >
        <PopoverPanel className="absolute z-10 w-64 md:w-[350px] right-0">
          <div className="bg-light-primary dark:bg-dark-primary border rounded-md border-light-200 dark:border-dark-200 w-full max-h-[200px] md:max-h-none overflow-y-auto flex flex-col">
            <div className="flex flex-row items-center justify-between px-3 py-2">
              <h4 className="text-black dark:text-white font-medium text-sm">
                Attached files
              </h4>
              <div className="flex flex-row items-center space-x-4">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className={cn(
                    'flex flex-row items-center space-x-1 text-black/70 dark:text-white/70 hover:text-black hover:dark:text-white transition duration-200 focus:outline-none',
                    isUploading && 'cursor-not-allowed opacity-60',
                  )}
                >
                  <input
                    type="file"
                    onChange={handleChange}
                    ref={fileInputRef}
                    accept=".pdf,.docx,.txt"
                    multiple
                    hidden
                    disabled={isUploading}
                  />
                  <Plus size={16} />
                  <p className="text-xs">Add</p>
                </button>
                <button
                  onClick={() => {
                    setFiles([]);
                    setFileIds([]);
                  }}
                  className="flex flex-row items-center space-x-1 text-black/70 dark:text-white/70 hover:text-black hover:dark:text-white transition duration-200 focus:outline-none"
                >
                  <Trash size={14} />
                  <p className="text-xs">Clear</p>
                </button>
              </div>
            </div>
            <div className="h-[0.5px] mx-2 bg-white/10" />
            <div className="flex flex-col items-center">
              {files.map((file, i) => (
                <div
                  key={i}
                  className="flex flex-row items-center justify-start w-full space-x-3 p-3"
                >
                  <div className="bg-light-100 dark:bg-dark-100 flex items-center justify-center w-10 h-10 rounded-md">
                    <File
                      size={16}
                      className="text-black/70 dark:text-white/70"
                    />
                  </div>
                  <p className="text-black/70 dark:text-white/70 text-sm">
                    {file.fileName.length > 25
                      ? file.fileName.replace(/\.\w+$/, '').substring(0, 25) +
                        '...' +
                        file.fileExtension
                      : file.fileName}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </PopoverPanel>
      </Transition>
    </Popover>
  ) : (
    <button
      type="button"
      onClick={() => fileInputRef.current?.click()}
      className={cn(
        'flex items-center justify-center active:border-none hover:bg-light-200 hover:dark:bg-dark-200 p-2 rounded-lg focus:outline-none headless-open:text-black dark:headless-open:text-white text-black/50 dark:text-white/50 active:scale-95 transition duration-200 hover:text-black dark:hover:text-white',
        isUploading && 'pointer-events-none opacity-60',
      )}
    >
      <input
        type="file"
        onChange={handleChange}
        ref={fileInputRef}
        accept=".pdf,.docx,.txt"
        multiple
        hidden
        disabled={isUploading}
      />
      <Paperclip size={16} className="-rotate-45 transform" />
    </button>
  );
};

export default Attach;
