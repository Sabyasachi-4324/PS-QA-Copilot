import time
from backend.knowledge_base import retrieve_context
from backend.bug_generator import generate_structured_bug

def run_test():
    # Sample tester input (vague observation)
    raw_tester_note = (
        "I lost connection while claiming my Treasure road reward. "
        "When internet came back, the reward popup popped up again on screen. "
        "So it got added to my inventory twice. I think this is a bug."
    )

    print("=" * 60)
    print(f"TESTER OBSERVATION:\n\"{raw_tester_note}\"")
    print("=" * 60)

    # Measure Retrieval Time
    print("\n--- Searching Pinecone for matching rules...")
    start_time = time.time()
    retrieved_rules = retrieve_context(raw_tester_note)
    retrieval_time = round(time.time() - start_time, 2)

    print(f"\n[SUCCESS] Retrieved Context (in {retrieval_time}s):")
    print("-" * 60)
    print(retrieved_rules)
    print("-" * 60)

    # Measure Generation Time
    print("\n--- AI Generating Structured Ticket...")
    start_time = time.time()
    ticket = generate_structured_bug(raw_tester_note)
    generation_time = round(time.time() - start_time, 2)

    print("\n" + "=" * 60)
    print("FINAL GENERATED BUG TICKET")
    print("=" * 60)
    for key, value in ticket.items():
        print(f"{key.upper()}: {value}")
    print("=" * 60)
    print(
        f"Speed: Retrieval ({retrieval_time}s) + "
        f"Generation ({generation_time}s) = "
        f"{round(retrieval_time + generation_time, 2)}s total"
    )

if __name__ == "__main__":
    run_test()