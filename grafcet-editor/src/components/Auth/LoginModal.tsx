import React, { useState, useEffect } from 'react';
import styled, { keyframes } from 'styled-components';
import { FiUser, FiLock, FiAlertCircle, FiX } from 'react-icons/fi';
import { useAuthStore } from '../../store/useAuthStore';

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const scaleIn = keyframes`
  from { opacity: 0; transform: scale(0.9) translateY(20px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
`;

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  padding: 20px;
  animation: ${fadeIn} 0.3s ease-out;
`;

const ModalContent = styled.div`
  width: 100%;
  max-width: 420px;
  background: white;
  border-radius: 28px;
  padding: 48px 40px;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
  animation: ${scaleIn} 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
`;

const CloseButton = styled.button`
  position: absolute;
  top: 24px;
  right: 24px;
  background: #f0f0f0;
  border: none;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #666;
  transition: all 0.2s;

  &:hover {
    background: #e0e0e0;
    color: #000;
    transform: rotate(90deg);
  }
`;

const Logo = styled.div`
  text-align: center;
  margin-bottom: 24px;
  
  img {
    height: 50px;
    mix-blend-mode: multiply;
  }
`;

const Title = styled.h2`
  font-size: 26px;
  font-weight: 800;
  text-align: center;
  color: #1a1a2e;
  margin-bottom: 8px;
`;

const Subtitle = styled.p`
  text-align: center;
  color: #666;
  margin-bottom: 32px;
  font-size: 15px;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 20px;
`;

const InputGroup = styled.div`
  position: relative;
`;

const InputIcon = styled.div`
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: #1976d2;
  font-size: 18px;
`;

const Input = styled.input`
  width: 100%;
  padding: 16px 16px 16px 48px;
  border: 2px solid #e0e0e0;
  border-radius: 14px;
  font-size: 16px;
  transition: all 0.2s;
  background: #fafafa;
  color: #000;
  
  &:focus {
    outline: none;
    border-color: #1976d2;
    background: white;
    box-shadow: 0 0 0 4px rgba(25, 118, 210, 0.1);
  }
`;

const SubmitButton = styled.button`
  width: 100%;
  padding: 16px;
  background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%);
  color: white;
  border: none;
  border-radius: 14px;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s;
  margin-top: 8px;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 20px rgba(25, 118, 210, 0.3);
  }
  
  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
    transform: none;
  }
`;

const ErrorMessage = styled.div`
  background: #ffebee;
  color: #c62828;
  padding: 12px 16px;
  border-radius: 10px;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 20px;
`;

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const { login, isLoading, error, clearError } = useAuthStore();

  useEffect(() => {
    if (error) clearError();
  }, [username, password]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await login(username, password);
  };

  return (
    <ModalOverlay onClick={(e) => e.target === e.currentTarget && onClose()}>
      <ModalContent>
        <CloseButton onClick={onClose}><FiX size={20}/></CloseButton>
        <Logo>
          <img src="/logo.png" alt="VibIndu Logo" />
        </Logo>
        <Title>Welcome Back</Title>
        <Subtitle>Sign in to your agentic workspace</Subtitle>
        
        {error && (
          <ErrorMessage>
            <FiAlertCircle /> {error}
          </ErrorMessage>
        )}
        
        <Form onSubmit={handleSubmit}>
          <InputGroup>
            <InputIcon><FiUser /></InputIcon>
            <Input
              type="text"
              placeholder="Username or Email"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
            />
          </InputGroup>
          
          <InputGroup>
            <InputIcon><FiLock /></InputIcon>
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </InputGroup>
          
          <SubmitButton type="submit" disabled={isLoading}>
            {isLoading ? 'Authenticating...' : 'Sign In'}
          </SubmitButton>
        </Form>
      </ModalContent>
    </ModalOverlay>
  );
};

export default LoginModal;
