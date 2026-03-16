import React, { useState } from 'react';
import styled, { keyframes } from 'styled-components';
import { FiX, FiUser, FiMail, FiBriefcase, FiGlobe, FiSend, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';

const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

const slideUp = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

const ModalOverlay = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 2000;
  backdrop-filter: blur(5px);
  animation: ${fadeIn} 0.2s ease-out;
`;

const ModalContent = styled.div`
  background: #fff;
  padding: 2.5rem;
  border-radius: 20px;
  width: 90%;
  max-width: 480px;
  position: relative;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  animation: ${slideUp} 0.3s ease-out;
`;

const CloseButton = styled.button`
  position: absolute;
  top: 1.25rem;
  right: 1.25rem;
  background: none;
  border: none;
  cursor: pointer;
  color: #999;
  padding: 0.5rem;
  border-radius: 50%;
  transition: all 0.2s;
  &:hover { color: #333; background: #f0f0f0; }
`;

const Logo = styled.div`
  text-align: center;
  margin-bottom: 1.5rem;
  img { height: 50px; mix-blend-mode: multiply; }
`;

const Title = styled.h2`
  text-align: center;
  font-size: 1.75rem;
  margin: 0 0 0.5rem;
  color: #212121;
`;

const Subtitle = styled.p`
  text-align: center;
  color: #666;
  margin: 0 0 2rem;
  font-size: 0.95rem;
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
`;

const InputGroup = styled.div`
  margin-bottom: 1.25rem;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: #333;
  font-size: 0.9rem;
`;

const InputWrapper = styled.div`
  position: relative;
`;

const InputIcon = styled.div`
  position: absolute;
  left: 1rem;
  top: 50%;
  transform: translateY(-50%);
  color: #999;
`;

const Input = styled.input`
  width: 100%;
  padding: 0.875rem 1rem 0.875rem 2.75rem;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  font-size: 1rem;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-sizing: border-box;
  &:focus {
    outline: none;
    border-color: #1976d2;
    box-shadow: 0 0 0 3px rgba(25, 118, 210, 0.1);
  }
`;

const SubmitButton = styled.button`
  background: linear-gradient(135deg, #1976d2 0%, #1565c0 100%);
  color: white;
  border: none;
  padding: 1rem;
  border-radius: 10px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: transform 0.2s, box-shadow 0.2s;
  margin-top: 0.5rem;
  &:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(25, 118, 210, 0.3);
  }
  &:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }
`;

const SuccessMessage = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 2rem 1rem;
  color: #2e7d32;
  svg { font-size: 3rem; margin-bottom: 1rem; }
  h3 { margin: 0 0 0.5rem; color: #2e7d32; }
  p { color: #666; margin: 0; }
`;

const ErrorMessage = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: #ffebee;
  color: #c62828;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  font-size: 0.9rem;
`;

interface RequestAccessModalProps {
  isOpen: boolean;
  onClose: () => void;
}

import { API_BASE_URL } from '../../config';

const API_URL = API_BASE_URL;

const RequestAccessModal: React.FC<RequestAccessModalProps> = ({ isOpen, onClose }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [profession, setProfession] = useState('');
  const [company, setCompany] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = () => {
    setName('');
    setEmail('');
    setProfession('');
    setCompany('');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/access-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, profession, company }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit request');
      }

      setIsSuccess(true);
      resetForm();

      // Auto close after 5 seconds
      setTimeout(() => {
        onClose();
        setIsSuccess(false);
      }, 5000);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    onClose();
    // Reset state after animation
    setTimeout(() => {
      setIsSuccess(false);
      setError(null);
    }, 300);
  };

  if (!isOpen) return null;

  return (
    <ModalOverlay onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <ModalContent>
        <CloseButton onClick={handleClose}>
          <FiX size={20} />
        </CloseButton>

        <Logo>
          <img src="/logo.png" alt="VibIndu" />
        </Logo>

        <Title>Request Early Access</Title>
        <Subtitle>
          Be among the first to experience the future of industrial automation.
        </Subtitle>

        {isSuccess ? (
          <SuccessMessage>
            <FiCheckCircle />
            <h3>Request Submitted!</h3>
            <p>Check your email for login credentials. You'll receive them shortly.</p>
          </SuccessMessage>
        ) : (
          <Form onSubmit={handleSubmit}>
            {error && (
              <ErrorMessage>
                <FiAlertCircle />
                <span>{error}</span>
              </ErrorMessage>
            )}

            <InputGroup>
              <Label>Full Name *</Label>
              <InputWrapper>
                <InputIcon><FiUser /></InputIcon>
                <Input
                  type="text"
                  placeholder="John Doe"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </InputWrapper>
            </InputGroup>

            <InputGroup>
              <Label>Email Address *</Label>
              <InputWrapper>
                <InputIcon><FiMail /></InputIcon>
                <Input
                  type="email"
                  placeholder="john@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </InputWrapper>
            </InputGroup>

            <InputGroup>
              <Label>Profession</Label>
              <InputWrapper>
                <InputIcon><FiBriefcase /></InputIcon>
                <Input
                  type="text"
                  placeholder="Automation Engineer, Developer, etc."
                  value={profession}
                  onChange={(e) => setProfession(e.target.value)}
                />
              </InputWrapper>
            </InputGroup>

            <InputGroup>
              <Label>Company</Label>
              <InputWrapper>
                <InputIcon><FiGlobe /></InputIcon>
                <Input
                  type="text"
                  placeholder="Your company name"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </InputWrapper>
            </InputGroup>

            <SubmitButton type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Submitting...' : (
                <>
                  <FiSend /> Submit Request
                </>
              )}
            </SubmitButton>
          </Form>
        )}
      </ModalContent>
    </ModalOverlay>
  );
};

export default RequestAccessModal;

