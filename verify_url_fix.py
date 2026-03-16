import os

def get_storyteller_url(is_docker, port):
    default_storyteller_url = f"ws://localhost:{port}/storyteller/ws/story" if is_docker else "ws://localhost:3005/ws/story"
    return default_storyteller_url

# Test cases
test_cases = [
    {"is_docker": True, "port": "8080", "expected": "ws://localhost:8080/storyteller/ws/story"},
    {"is_docker": True, "port": "8000", "expected": "ws://localhost:8000/storyteller/ws/story"},
    {"is_docker": False, "port": "8000", "expected": "ws://localhost:3005/ws/story"},
]

for tc in test_cases:
    result = get_storyteller_url(tc["is_docker"], tc["port"])
    print(f"Docker: {tc['is_docker']}, Port: {tc['port']} -> {result}")
    assert result == tc["expected"], f"Failed: Expected {tc['expected']}, got {result}"

print("\nLogic Verification PASSED!")
