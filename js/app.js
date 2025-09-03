const fileInput = document.getElementById("fileInput");
const dropZone = document.getElementById("dropZone");
const processBtn = document.getElementById("processBtn");
const message = document.getElementById("message");
const combineCheckboxContainer = document.getElementById("combineContainer");
const combineCheckbox = document.getElementById("combinePDFs");
const fileListContainer = document.getElementById("fileList");
const progressBar = document.getElementById("progressBar");

let filesArray = [];

// --- Drag & Drop ---
dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", e => {
  e.preventDefault();
  dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", e => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
});

dropZone.addEventListener("drop", e => {
  e.preventDefault();
  dropZone.classList.remove("dragover");
  const files = Array.from(e.dataTransfer.files);
  filesArray.push(...files);
  updateFileList();
});

// Captura seleção de arquivos
fileInput.addEventListener("change", (e) => {
  filesArray.push(...Array.from(e.target.files));
  updateFileList();
});

// Atualiza lista visual com miniaturas
function updateFileList() {
  fileListContainer.innerHTML = "";
  filesArray.forEach((file, index) => {
    const div = document.createElement("div");
    div.className = "file-item";
    div.draggable = true;

    let filePreview = '';
    if (file.type.startsWith("image/")) {
      const url = URL.createObjectURL(file);
      filePreview = `<img src="${url}" alt="preview">`;
    } else {
      filePreview = `<div class="w-14 h-14 bg-gray-200 flex items-center justify-center rounded-lg font-bold text-gray-600">${file.name.split('.').pop().toUpperCase()}</div>`;
    }

    div.innerHTML = `
      <div class="file-info">
        ${filePreview}
        <span class="font-medium text-gray-700">${file.name}</span>
      </div>
      <button onclick="removeFile(${index})">Excluir</button>
    `;

    // Drag & reorder
    div.addEventListener("dragstart", e => { e.dataTransfer.setData("text/plain", index); });
    div.addEventListener("drop", e => {
      e.preventDefault();
      const fromIndex = e.dataTransfer.getData("text/plain");
      const toIndex = index;
      const temp = filesArray[fromIndex];
      filesArray.splice(fromIndex, 1);
      filesArray.splice(toIndex, 0, temp);
      updateFileList();
    });
    div.addEventListener("dragover", e => e.preventDefault());

    fileListContainer.appendChild(div);
  });

  // Mostra ou oculta o checkbox "Combinar PDFs"
  combineCheckboxContainer.style.display = filesArray.length > 0 ? "flex" : "none";
}

// Remove arquivo
window.removeFile = function(index) {
  filesArray.splice(index, 1);
  updateFileList();
}

// Converter arquivos
processBtn.addEventListener("click", async () => {
  message.textContent = "";
  progressBar.style.width = "0%";

  if (!filesArray.length) {
    message.textContent = "Nenhum arquivo selecionado!";
    return;
  }

  const combinePDFs = combineCheckbox.checked;

  try {
    if (combinePDFs) {
      await generateCombinedPDF(filesArray);
      progressBar.style.width = "100%";
    } else {
      for (let i = 0; i < filesArray.length; i++) {
        await generateSinglePDF(filesArray[i]);
        progressBar.style.width = `${((i + 1)/filesArray.length)*100}%`;
      }
    }

    // Mensagem de sucesso
    message.textContent = "Conversão concluída com sucesso!";
    message.className = "text-center mt-2 font-medium text-green-600";

    // Limpar tudo após 2s
    setTimeout(() => {
      filesArray = [];
      updateFileList();
      progressBar.style.width = "0%";
      message.textContent = "";
      combineCheckbox.checked = false;
      combineCheckboxContainer.style.display = "none";
    }, 2000);

  } catch (err) {
    console.error(err);
    message.textContent = "Erro ao processar os arquivos.";
    message.className = "text-center mt-2 font-medium text-red-600";
  }
});

// --- Funções de conversão (igual versão anterior) ---
async function generateSinglePDF(file) {
  const pdfDoc = await PDFLib.PDFDocument.create();
  await addFileToPDF(file, pdfDoc);
  const pdfBytes = await pdfDoc.save();
  saveAs(new Blob([pdfBytes], { type: "application/pdf" }), file.name.replace(/\..+$/, ".pdf"));
}

async function generateCombinedPDF(files) {
  const pdfDoc = await PDFLib.PDFDocument.create();
  for (const file of files) await addFileToPDF(file, pdfDoc);
  const pdfBytes = await pdfDoc.save();
  saveAs(new Blob([pdfBytes], { type: "application/pdf" }), "arquivos_combinados.pdf");
}

async function addFileToPDF(file, pdfDoc) {
  const fileType = file.type;
  const reader = new FileReader();
  return new Promise((resolve, reject) => {
    reader.onload = async () => {
      try {
        const page = pdfDoc.addPage([595, 842]);
        if (fileType.startsWith("text/") || file.name.endsWith(".csv")) {
          page.drawText(reader.result, { x: 50, y: 750, size: 12, color: PDFLib.rgb(0,0,0) });
        } else if (fileType.startsWith("image/")) {
          const imgBytes = new Uint8Array(reader.result);
          let img = fileType === "image/png" ? await pdfDoc.embedPng(imgBytes) : await pdfDoc.embedJpg(imgBytes);
          const { width, height } = img.size();
          const scale = Math.min(500 / width, 700 / height);
          page.drawImage(img, { x: 50, y: 700 - height*scale, width: width*scale, height: height*scale });
        } else if (file.name.endsWith(".docx")) {
          const result = await mammoth.extractRawText({ arrayBuffer: reader.result });
          page.drawText(result.value || "Documento vazio", { x: 50, y: 750, size: 12, color: PDFLib.rgb(0,0,0) });
        } else if (file.name.endsWith(".xlsx")) {
          const data = new Uint8Array(reader.result);
          const workbook = XLSX.read(data, { type: "array" });
          let content = "";
          workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            content += XLSX.utils.sheet_to_csv(sheet) + "\n";
          });
          page.drawText(content || "Planilha vazia", { x: 50, y: 750, size: 12, color: PDFLib.rgb(0,0,0) });
        } else {
          page.drawText("Arquivo não suportado: "+file.name, { x: 50, y: 750, size: 12, color: PDFLib.rgb(1,0,0) });
        }
        resolve();
      } catch(err){ reject(err); }
    };
    if (fileType.startsWith("text/") || file.name.endsWith(".csv")) reader.readAsText(file);
    else reader.readAsArrayBuffer(file);
  });
}
