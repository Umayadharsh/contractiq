import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, X, RotateCcw, Send } from 'lucide-react';
import {
  processAssistantQuery,
  ASSISTANT_SUGGESTION_CHIPS,
  getDaysUntilRenewal,
} from '../../utils/assistantIntents';
import './AssistantWidget.css';

export default function AssistantWidget({
  contracts = [],
  stats = null,
  statsError = null,
  session = null,
  onSelectContract,
  onNavigate,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      sender: 'bot',
      text: 'Hello! I am your portfolio assistant. Ask me anything about contract counts, risk findings, renewal dates, or approval workflows.',
      source: 'Source: portfolio statistics',
    },
  ]);

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll messages to bottom
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping, isOpen]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Handle Escape key to close
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  function handleSendMessage(queryText) {
    const textToSend = (queryText || inputValue).trim();
    if (!textToSend || isTyping) return;

    const userMsgId = `user-${Date.now()}`;
    const userMsg = {
      id: userMsgId,
      sender: 'user',
      text: textToSend,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue('');
    setIsTyping(true);

    // Short typing delay before deterministic answer to feel natural
    setTimeout(() => {
      const result = processAssistantQuery(textToSend, {
        contracts,
        stats,
        statsError,
        session,
      });

      const botMsg = {
        id: `bot-${Date.now()}`,
        sender: 'bot',
        text: result.text,
        contracts: result.contracts || [],
        source: result.source,
        isError: result.isError,
      };

      setMessages((prev) => [...prev, botMsg]);
      setIsTyping(false);
    }, 380);
  }

  function handleClearChat() {
    setMessages([
      {
        id: `welcome-${Date.now()}`,
        sender: 'bot',
        text: 'Chat cleared. Ask me a question about your portfolio, or pick a suggested topic below.',
        source: 'Source: portfolio statistics',
      },
    ]);
  }

  function handleContractClick(contractId) {
    if (onSelectContract) {
      onSelectContract(contractId);
    }
    if (onNavigate) {
      onNavigate('contracts', 'All');
    }
  }

  return (
    <>
      {/* Floating launcher button */}
      {!isOpen && (
        <button
          type="button"
          className="ciq-assistant-launcher"
          onClick={() => setIsOpen(true)}
          aria-label="Open Contract Assistant"
          title="Open Contract Assistant"
        >
          <MessageSquare size={22} />
          <span className="ciq-assistant-launcher-badge" aria-hidden="true" />
        </button>
      )}

      {/* Floating Chat Panel */}
      {isOpen && (
        <section
          className="ciq-assistant-panel"
          role="dialog"
          aria-label="Contract Assistant chat window"
        >
          {/* Header */}
          <div className="ciq-assistant-header">
            <div className="ciq-assistant-header-title">
              <span className="ciq-assistant-status-dot" aria-hidden="true" />
              <span>Contract Assistant</span>
            </div>
            <div className="ciq-assistant-header-actions">
              <button
                type="button"
                className="ciq-assistant-icon-btn"
                onClick={handleClearChat}
                aria-label="Clear chat"
                title="Clear chat"
              >
                <RotateCcw size={16} />
              </button>
              <button
                type="button"
                className="ciq-assistant-icon-btn"
                onClick={() => setIsOpen(false)}
                aria-label="Close Contract Assistant"
                title="Close chat"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Suggestion Chips */}
          <div className="ciq-assistant-chips" role="toolbar" aria-label="Suggested questions">
            {ASSISTANT_SUGGESTION_CHIPS.map((chip, index) => (
              <button
                key={index}
                type="button"
                className="ciq-assistant-chip"
                onClick={() => handleSendMessage(chip)}
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Messages Area */}
          <div className="ciq-assistant-messages" tabIndex={0} aria-label="Message history">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`ciq-assistant-msg-row ${
                  msg.sender === 'user' ? 'ciq-assistant-msg-user' : 'ciq-assistant-msg-bot'
                }`}
              >
                <div className="ciq-assistant-bubble">
                  {msg.text}

                  {/* Clickable contract items */}
                  {msg.contracts && msg.contracts.length > 0 && (
                    <div className="ciq-assistant-contracts-list">
                      {msg.contracts.map((c) => {
                        const renewalDays = getDaysUntilRenewal(c);
                        const isCritical =
                          c.complianceReport?.overallStatus?.toLowerCase() === 'critical' ||
                          c.complianceReport?.overallStatus?.toLowerCase() === 'major';

                        let badgeClass = '';
                        if (c.status === 'Approved') badgeClass = 'approved';
                        else if (c.status === 'Rejected' || isCritical) badgeClass = 'critical';
                        else if (c.status?.includes('Waiting') || c.status === 'NeedsReview') badgeClass = 'waiting';

                        return (
                          <button
                            key={c._id}
                            type="button"
                            className="ciq-assistant-contract-card"
                            onClick={() => handleContractClick(c._id)}
                            title={`Open ${c.title}`}
                            aria-label={`View details for ${c.title}`}
                          >
                            <span className="ciq-assistant-contract-title">{c.title}</span>
                            <div className="ciq-assistant-contract-meta">
                              <span>{c.counterparty || 'Unknown counterparty'}</span>
                              <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                {renewalDays !== null && renewalDays <= 30 && renewalDays > 0 && (
                                  <span className="ciq-assistant-contract-badge waiting">
                                    {renewalDays}d left
                                  </span>
                                )}
                                <span className={`ciq-assistant-contract-badge ${badgeClass}`}>
                                  {c.status || 'Active'}
                                </span>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                {msg.source && <span className="ciq-assistant-caption">{msg.source}</span>}
              </div>
            ))}

            {/* Typing Indicator */}
            {isTyping && (
              <div className="ciq-assistant-msg-row ciq-assistant-msg-bot">
                <div className="ciq-assistant-typing" aria-label="Assistant is typing">
                  <span className="ciq-assistant-typing-dot" />
                  <span className="ciq-assistant-typing-dot" />
                  <span className="ciq-assistant-typing-dot" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Bar */}
          <form
            className="ciq-assistant-form"
            onSubmit={(e) => {
              e.preventDefault();
              handleSendMessage();
            }}
          >
            <input
              ref={inputRef}
              type="text"
              className="ciq-assistant-input"
              placeholder="Ask about contracts or stats..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isTyping}
              aria-label="Type your contract question"
            />
            <button
              type="submit"
              className="ciq-assistant-send-btn"
              disabled={!inputValue.trim() || isTyping}
              aria-label="Send message"
              title="Send message"
            >
              <Send size={15} />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
