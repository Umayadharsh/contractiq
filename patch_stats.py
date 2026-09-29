with open("backend/src/routes/contracts.js", "r", encoding="utf-8") as f:
    text = f.read()

target = """      res.json({ ...stats, summary });
    } catch (error) { next(error); }
  });
    const reviewed = await Contract.countDocuments({ workspaceId, status: 'Reviewed' });
    const needsReview = await Contract.countDocuments({ workspaceId, status: 'NeedsReview' });
    const failed = await Contract.countDocuments({ workspaceId, status: 'Failed' });
    
    res.json({ total, reviewed, needsReview, failed });
  } catch (error) { next(error); }
});"""

replacement = """      const recipients = await getNotificationRecipients(workspaceId);
      res.json({ ...stats, summary, recipients });
    } catch (error) { next(error); }
});"""

if target in text:
    text = text.replace(target, replacement)
    with open("backend/src/routes/contracts.js", "w", encoding="utf-8") as f:
        f.write(text)
    print("Success")
else:
    print("Target not found")
