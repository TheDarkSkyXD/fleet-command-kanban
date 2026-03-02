import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { renderMarkdown } from "@/lib/markdown";
import { api } from "@/api/client";

export interface ChangelogModalProps {
  projectId: string;
  onClose: () => void;
}

export function ChangelogModal({ projectId, onClose }: ChangelogModalProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["template-changelog", projectId],
    queryFn: () => api.getTemplateChangelog(projectId),
  });

  const renderedChangelog = useMemo(() => {
    if (!data?.changelog) return null;
    try {
      return renderMarkdown(data.changelog);
    } catch {
      return null;
    }
  }, [data?.changelog]);

  return (
    <div className="fullscreen-modal fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 max-w-2xl w-full mx-4 border border-gray-700 max-h-[80vh] flex flex-col">
        <h2 className="text-xl font-bold text-white mb-4">Template Changelog</h2>
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <p className="text-gray-400">Loading...</p>
          ) : renderedChangelog ? (
            <div
              className="prose prose-sm prose-invert max-w-none text-gray-300
                [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-white [&_h1]:mt-0 [&_h1]:mb-4
                [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-blue-400 [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:pb-2 [&_h2]:border-b [&_h2]:border-gray-700
                [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-gray-400 [&_h3]:uppercase [&_h3]:tracking-wide [&_h3]:mt-4 [&_h3]:mb-2
                [&_ul]:my-2 [&_ul]:space-y-1
                [&_li]:text-sm [&_li]:text-gray-300 [&_li]:my-0
                [&_strong]:text-white [&_strong]:font-medium
                [&_p]:my-2 [&_p]:text-sm"
              dangerouslySetInnerHTML={{ __html: renderedChangelog }}
            />
          ) : (
            <p className="text-gray-400">No changelog available.</p>
          )}
        </div>
        <div className="flex justify-end mt-4 pt-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 text-white rounded font-medium"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
