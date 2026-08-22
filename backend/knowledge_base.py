import os

from langchain_community.document_loaders import TextLoader, PyPDFLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_google_genai import GoogleGenerativeAIEmbeddings
from langchain_pinecone import PineconeVectorStore
from pinecone import Pinecone, ServerlessSpec

PINECONE_API_KEY = os.getenv("PINECONE_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")

if not PINECONE_API_KEY:
    raise RuntimeError("PINECONE_API_KEY environment variable is not set")

if not GOOGLE_API_KEY:
    raise RuntimeError("GOOGLE_API_KEY environment variable is not set")

INDEX_NAME = "qa-copilot-rules"

pc = Pinecone(api_key=PINECONE_API_KEY)

EMBEDDING_DIMENSION = 3072

if INDEX_NAME not in pc.list_indexes().names():
    pc.create_index(
        name=INDEX_NAME,
        dimension=EMBEDDING_DIMENSION,
        metric="cosine",
        spec=ServerlessSpec(
            cloud="aws",
            region="us-east-1"
        )
    )

embeddings = GoogleGenerativeAIEmbeddings(
    model="models/gemini-embedding-001",
    google_api_key=GOOGLE_API_KEY
)


def ingest_all_documents(docs_folder: str = "docs"):
    """Scans the folder and uploads rulebooks to Pinecone."""
    print(f"Scanning '{docs_folder}' for rulebooks...")
    all_documents = []

    if not os.path.exists(docs_folder):
        os.makedirs(docs_folder)
        print(
            f"Created {docs_folder} folder. "
            "Please add PDFs/TXTs and run again."
        )
        return

    for filename in os.listdir(docs_folder):
        file_path = os.path.join(docs_folder, filename)

        if filename.endswith(".txt"):
            loader = TextLoader(file_path)
            all_documents.extend(loader.load())

        elif filename.endswith(".pdf"):
            loader = PyPDFLoader(file_path)
            all_documents.extend(loader.load())

    if not all_documents:
        print("No documents found in the 'docs' folder!")
        print(
            "--> Add your rulebook PDFs or TXT files "
            "to the 'docs' folder, then run again."
        )
        return

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50
    )

    chunks = text_splitter.split_documents(all_documents)

    print(
        f"Uploading {len(chunks)} rulebook chunks "
        "to Pinecone Cloud..."
    )

    PineconeVectorStore.from_documents(
        chunks,
        embeddings,
        index_name=INDEX_NAME
    )

    print("Cloud Database successfully built!")


def retrieve_context(query: str) -> str:
    """Searches the Pinecone database for matching rules."""
    vectorstore = PineconeVectorStore(
        index_name=INDEX_NAME,
        embedding=embeddings
    )

    results = vectorstore.similarity_search(query, k=3)

    return "\n\n".join(
        [doc.page_content for doc in results]
    )


def ingest_single_document(file_path: str):
    """Reads a single uploaded rulebook and pushes it to Pinecone."""
    print(f"--- Processing new rulebook: {file_path}")

    if file_path.endswith(".txt"):
        loader = TextLoader(file_path)

    elif file_path.endswith(".pdf"):
        loader = PyPDFLoader(file_path)

    else:
        print("Unsupported file format.")
        return False

    docs = loader.load()

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=500,
        chunk_overlap=50
    )

    chunks = text_splitter.split_documents(docs)

    print(
        f"--- Uploading {len(chunks)} chunks to Pinecone..."
    )

    PineconeVectorStore.from_documents(
        chunks,
        embeddings,
        index_name=INDEX_NAME
    )

    print("--- Success! New rules added to the AI brain.")

    return True