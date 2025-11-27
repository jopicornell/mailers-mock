import * as React from 'react';
import { Mail, MailPersonalization } from '@/types/Mail';

interface PopUpProps {
  currentEmail: Mail;
  selectedEmailType: 'text/plain' | 'text/html';
  hide: () => void;
}

const SimpleContent = (content: string) => {
  return <div>{content}</div>;
};

const HtmlContent = (content: string, mailContext: Mail) => {
  const attachments = mailContext.attachments || [];

  const contentWithAttachedAttachments = attachments
    .filter(attachment => attachment.disposition === 'inline')
    .reduce((prevContent, attachment) => {
      return prevContent.replace(
        `cid:${attachment.content_id}`,
        `data:${attachment.type};base64, ${attachment.content}`
      );
    }, content);

  return (
    <iframe
      className="w-full h-full min-h-[500px] border-0"
      srcDoc={contentWithAttachedAttachments}
      sandbox="allow-same-origin allow-scripts allow-popups"
    />
  );
};

const TemplateContent = (templateId: string, personalizations?: MailPersonalization[]) => {
  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-200 rounded-lg">
        <div className="text-sm font-medium text-blue-700 mb-1">Template ID</div>
        <div className="font-mono text-sm text-blue-900">{templateId}</div>
      </div>

      <div className="space-y-4">
        {
          (personalizations || [])
            .map((p, index) => {
              return (
                <div key={index} className="border border-gray-200 rounded-lg p-4 space-y-4">
                  <div>
                    <div className="text-sm font-semibold text-gray-700 mb-2">Recipients:</div>
                    <ul className="space-y-1">
                      {(p.to || []).map(to => (
                        <li key={to.email} className="flex items-center text-sm text-gray-600">
                          <svg className="w-4 h-4 mr-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                          </svg>
                          {to.email}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div>
                    <div className="text-sm font-semibold text-gray-700 mb-2">Template Data:</div>
                    <pre className="bg-gray-50 border border-gray-200 rounded p-3 text-xs overflow-x-auto">
                      {JSON.stringify(p.dynamic_template_data, null, 2)}
                    </pre>
                  </div>
                </div>
              );
            })
        }
      </div>
    </div>
  );
};

const PopUp = (props: PopUpProps) => {
  // eslint-disable-next-line no-unused-vars
  const contentRenderer: Record<string, (content: string, mailContext: Mail) => React.JSX.Element> = {
    'text/plain': SimpleContent,
    'text/html': HtmlContent,
  };

  const renderContent = (type: string, content: string, mailContext: Mail) => {
    console.log('renderContent', type, content, mailContext);
    const renderer = contentRenderer[type];

    if (renderer) {
      return renderer(content, mailContext);
    } else {
      return <div>{''}</div>;
    }
  };

  const renderDisplayContent = (displayContent: Mail['displayContent'], selectedEmailType?: string) => {
    if (Array.isArray(displayContent)) {
      console.log('renderDisplayContent', displayContent, selectedEmailType);
      return (
        <div>
          {displayContent.filter(content => content.type === selectedEmailType).map((content, index) => (
            <div key={index}>
              {
                renderContent(
                  content.type,
                  content.value,
                  props.currentEmail
                )
              }
            </div>
          ))}
        </div>
      );
    } else {
      return <div>{''}</div>;
    }
  };
  console.log(props.currentEmail);
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-sm">
      <div className="flex min-h-screen items-start justify-center">
        <div className="relative w-full max-w-5xl my-8 bg-white rounded-xl shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-200">

          {/* Header */}
          <div className="flex items-center justify-between px-6 py-2 border-b border-gray-200 bg-gradient-to-r from-white to-gray-200 rounded-t-xl">
            <h1
              className="text-xl font-semibold text-gray-900 truncate pr-4 flex-1"
              title={props.currentEmail.subject}
            >
              {props.currentEmail.subject || '(No Subject)'}
            </h1>
            <button
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-white/80 transition-colors text-gray-500 hover:text-gray-700"
              onClick={props.hide}
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto bg-white rounded-b-xl">
            {props.currentEmail.template_id ?
              TemplateContent(
                props.currentEmail.template_id,
                props.currentEmail.personalizations
              ) :
              renderDisplayContent(props.currentEmail.displayContent, props.selectedEmailType)
            }
          </div>

        </div>
      </div>
    </div>
  );
};

export default React.memo(PopUp);

