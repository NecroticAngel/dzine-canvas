export const downloadObjectAsJson = (exportName: string, data: unknown) => {
  const dataStr = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data))}`;
  const downloadAnchorNode = document.createElement('a');
  downloadAnchorNode.setAttribute('href', dataStr);
  downloadAnchorNode.setAttribute('download', `${exportName}.json`);
  document.body.appendChild(downloadAnchorNode); // required for firefox
  downloadAnchorNode.click();
  downloadAnchorNode.remove();
};

export const downloadDataUrl = (exportName: string, dataUrl: string) => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = exportName;
  document.body.appendChild(link);
  link.click();
  link.remove();
};

export const downloadBlob = (exportName: string, blob: Blob) => {
  const url = URL.createObjectURL(blob);
  downloadDataUrl(exportName, url);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};
